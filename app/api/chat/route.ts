/**
 * POST /api/chat — send a message in a conversation, stream the response.
 *
 * Wire format: Server-Sent Events. Events emitted:
 *   - meta     { conversation_id }
 *   - text     { text }                                   text delta
 *   - tool     { tool_name, status, label }               tool call status
 *   - done     { message_id, usage, cost_usd }            final completion
 *   - error    { message }                                fatal error
 *
 * The route supports an agent loop: when the model emits a tool_use block,
 * the corresponding handler in lib/chat/tools.ts runs server-side (RLS
 * scoped to the advisor), the result is appended to the message history,
 * and the loop continues until the model returns end_turn. Up to
 * MAX_TOOL_ITERATIONS turns per request to bound cost.
 *
 * Persistence happens server-side regardless of client connection — closing
 * the browser mid-stream still produces saved assistant + tool rows.
 */
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropic, CHAT_MODEL_DEFAULT, computeMessageCost } from "@/lib/chat/anthropic";
import { buildSystemPrompt } from "@/lib/chat/system-prompt";
import { CHAT_TOOLS, runTool, getToolStatusLabel } from "@/lib/chat/tools";
import { parseDataUrl } from "@/lib/chat/attachments";
import { hasActiveSubscription } from "@/lib/auth/requireActiveSubscription";
import type { ChatContentBlock } from "@/lib/types/chat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_TOOL_ITERATIONS = 5;

interface PostBody {
  conversation_id?: string | null;
  message: string;
  attachments?: string[];
}

function sseEvent(controller: ReadableStreamDefaultController, name: string, data: unknown) {
  const payload = `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(new TextEncoder().encode(payload));
}

function deriveTitle(userMessage: string): string {
  const trimmed = userMessage.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 60) return trimmed;
  return trimmed.slice(0, 57) + "...";
}

interface CumulativeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
}

function addUsage(acc: CumulativeUsage, u: Partial<CumulativeUsage>): void {
  acc.input_tokens += u.input_tokens ?? 0;
  acc.output_tokens += u.output_tokens ?? 0;
  acc.cache_read_tokens += u.cache_read_tokens ?? 0;
  acc.cache_creation_tokens += u.cache_creation_tokens ?? 0;
}

// True for errors worth retrying: Anthropic capacity issues (overloaded /
// rate-limited) and transient 5xx / network errors. We do NOT retry 4xx
// (invalid_request, auth, etc) - those won't succeed on retry and would
// just waste time + tokens.
function isRetryableAnthropicError(err: unknown): boolean {
  if (!err) return false;
  // SDK errors carry .status (HTTP) and .error.type (Anthropic taxonomy).
  // Strings sometimes leak through too (e.g., from .finalMessage rejection).
  const anyErr = err as { status?: number; error?: { type?: string }; message?: string };
  if (anyErr.status === 429 || anyErr.status === 529) return true;
  if (typeof anyErr.status === "number" && anyErr.status >= 500 && anyErr.status < 600) return true;
  const errType = anyErr.error?.type;
  if (errType === "overloaded_error" || errType === "rate_limit_error" || errType === "api_error") return true;
  const msg = String(anyErr.message || "").toLowerCase();
  if (msg.includes("overloaded") || msg.includes("rate_limit") || msg.includes("rate limit")) return true;
  return false;
}

function friendlyErrorMessage(err: unknown): string {
  const anyErr = err as { status?: number; error?: { type?: string }; message?: string };
  const errType = anyErr.error?.type;
  if (errType === "overloaded_error" || anyErr.status === 529) {
    return "The AI is overloaded right now. Please send your message again in a moment.";
  }
  if (errType === "rate_limit_error" || anyErr.status === 429) {
    return "Hit a rate limit - please wait a few seconds and try again.";
  }
  if (typeof anyErr.status === "number" && anyErr.status >= 500) {
    return "The AI service had a temporary error. Please try again.";
  }
  return anyErr.message || "Chat request failed.";
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // Subscription gate — users hitting the payment wall shouldn't be able
  // to call this endpoint and incur Anthropic cost on our tab.
  if (!(await hasActiveSubscription(supabase, user.id))) {
    return new Response("Subscription required", { status: 402 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (!body.message || typeof body.message !== "string") {
    return new Response("Missing message", { status: 400 });
  }

  // Resolve / create conversation.
  let conversationId = body.conversation_id ?? null;
  if (conversationId) {
    const { data: convo } = await supabase
      .from("chat_conversations")
      .select("id, user_id")
      .eq("id", conversationId)
      .single();
    if (!convo || convo.user_id !== user.id) {
      return new Response("Conversation not found", { status: 404 });
    }
  } else {
    const title = deriveTitle(body.message);
    const { data: inserted, error } = await supabase
      .from("chat_conversations")
      .insert({ user_id: user.id, title })
      .select("id")
      .single();
    if (error || !inserted) {
      return new Response("Failed to create conversation", { status: 500 });
    }
    conversationId = inserted.id;
  }

  // Persist the user message. Attachments come in as data: URLs from the
  // client; we convert each to a base64 image block for Anthropic. The
  // data: URL itself is what we save in chat_messages.attachment_url so
  // the UI can render it later without a second round-trip.
  //
  // Server-side cap mirrors the client-side prepareAttachment 4MB limit.
  // Without this, a hand-crafted POST body could ship a 50MB data URL that
  // we'd base64-decode (~66MB in memory) and forward to Anthropic.
  const MAX_ATTACHMENT_BASE64_CHARS = 6 * 1024 * 1024; // ~4.5MB decoded
  const attachments = (body.attachments ?? []).filter(
    (u) => typeof u === "string" && u.length <= MAX_ATTACHMENT_BASE64_CHARS,
  );
  const userContentBlocks: ChatContentBlock[] = [];
  for (const dataUrl of attachments) {
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) continue;
    userContentBlocks.push({
      type: "image",
      source: { type: "base64", media_type: parsed.mediaType, data: parsed.base64 },
    });
  }
  userContentBlocks.push({ type: "text", text: body.message });
  await supabase.from("chat_messages").insert({
    conversation_id: conversationId,
    user_id: user.id,
    role: "user",
    content: body.message,
    content_blocks: userContentBlocks,
    attachment_url: attachments[0] ?? null,
  });

  // Load conversation history. tool_use ↔ tool_result must stay paired,
  // so we replay each row's content_blocks verbatim when present.
  const { data: priorRows } = await supabase
    .from("chat_messages")
    .select("role, content, content_blocks")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  type AnthMessage = {
    role: "user" | "assistant";
    content: string | ChatContentBlock[];
  };
  const messages: AnthMessage[] = [];
  // Tracks tool_use_ids the most recent assistant turn announced, so we
  // can drop orphan tool_result blocks left over from the pre-fix bug
  // where intermediate assistant turns weren't persisted.
  let availableToolUseIds = new Set<string>();
  for (const row of priorRows ?? []) {
    if (row.role === "tool") {
      const blocks = (row.content_blocks ?? []) as ChatContentBlock[];
      const valid = blocks.filter(
        (b) => b.type === "tool_result" && availableToolUseIds.has(b.tool_use_id)
      );
      if (valid.length > 0) {
        messages.push({ role: "user", content: valid });
        for (const b of valid) {
          if (b.type === "tool_result") availableToolUseIds.delete(b.tool_use_id);
        }
      }
      // If no valid blocks (orphaned from old conversation), silently skip
      // the row — better than 400ing the whole request.
      continue;
    }
    const blocks = (row.content_blocks ?? null) as ChatContentBlock[] | null;
    if (row.role === "assistant") {
      // ALWAYS reset the available set on an assistant row, even when
      // blocks is null (legacy rows / errored streams). Previously this
      // branch only ran when blocks was truthy, leaving a stale tool_use
      // id from a prior turn — which would then incorrectly match a later
      // tool_result and either crash or replay the wrong context.
      availableToolUseIds = new Set(
        (blocks ?? [])
          .filter((b) => b.type === "tool_use")
          .map((b) => (b as { id: string }).id)
      );
    } else if (row.role === "user") {
      // User turns reset the "available" set — a user message means the
      // model's prior turn is closed.
      availableToolUseIds = new Set();
    }
    if (blocks && blocks.length > 0) {
      messages.push({ role: row.role as "user" | "assistant", content: blocks });
    } else {
      messages.push({
        role: row.role as "user" | "assistant",
        content: row.content,
      });
    }
  }

  const anthropic = getAnthropic();
  const model = CHAT_MODEL_DEFAULT;
  const systemBlocks = buildSystemPrompt();

  const stream = new ReadableStream({
    async start(controller) {
      sseEvent(controller, "meta", { conversation_id: conversationId });

      const cumulativeUsage: CumulativeUsage = {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
      };
      // Last persisted assistant message id — used to stamp created_ticket_id
      // on the final turn if the model called create_support_ticket. We
      // update this after each iteration's insert.
      let lastAssistantMessageId: string | null = null;
      // Filled by the create_support_ticket tool when the model decides to
      // escalate. Stamped on the final assistant row after the loop ends.
      const sideEffects: { ticketId?: string } = {};
      // Captures the most recent in-flight text being streamed (resets each
      // iteration). If the stream errors mid-reveal, the catch path uses
      // this to persist whatever the user already saw on screen, instead
      // of dropping it on the floor and showing only "[error]".
      let partialStreamedText = "";
      // Flipped to true the moment the current iteration's assistant row
      // is persisted. If the catch fires AFTER that (e.g., tool execution
      // or next iter throws), the catch knows the in-flight text was
      // already saved and only needs to append the error note.
      let currentIterRowPersisted = false;

      try {
        for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
          // Retry the stream attempt up to 3 times on overload / rate-limit /
          // 5xx. We can only safely retry BEFORE any text deltas have been
          // emitted to the client; otherwise the user would see the text
          // duplicate. The inner try/catch enforces that.
          const MAX_STREAM_ATTEMPTS = 3;
          let iterText = "";
          let iterUsage: CumulativeUsage = {
            input_tokens: 0,
            output_tokens: 0,
            cache_read_tokens: 0,
            cache_creation_tokens: 0,
          };
          let finalMessageContent: ChatContentBlock[] | null = null;
          let finalStopReason: string | null = null;

          for (let attempt = 1; attempt <= MAX_STREAM_ATTEMPTS; attempt++) {
            iterText = "";
            partialStreamedText = "";
            currentIterRowPersisted = false;
            iterUsage = {
              input_tokens: 0,
              output_tokens: 0,
              cache_read_tokens: 0,
              cache_creation_tokens: 0,
            };
            const announcedTools = new Set<number>();
            try {
              // The Anthropic SDK has stricter content-block types than our
              // ChatContentBlock (image source must be Base64ImageSource OR
              // URLImageSource, not both). Runtime shape is valid because the
              // engine only emits blocks the SDK accepts; cast at the boundary.
              const anthStream = anthropic.messages.stream({
                model,
                max_tokens: 1024,
                system: systemBlocks,
                tools: CHAT_TOOLS,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                messages: messages as any,
              });

              for await (const event of anthStream) {
                if (event.type === "content_block_start") {
                  if (event.content_block.type === "tool_use" && !announcedTools.has(event.index)) {
                    announcedTools.add(event.index);
                    sseEvent(controller, "tool", {
                      tool_name: event.content_block.name,
                      status: "running",
                      label: getToolStatusLabel(event.content_block.name),
                    });
                  }
                } else if (
                  event.type === "content_block_delta" &&
                  event.delta.type === "text_delta"
                ) {
                  iterText += event.delta.text;
                  partialStreamedText = iterText;
                  sseEvent(controller, "text", { text: event.delta.text });
                } else if (event.type === "message_start" && event.message.usage) {
                  addUsage(iterUsage, {
                    input_tokens: event.message.usage.input_tokens ?? 0,
                    output_tokens: event.message.usage.output_tokens ?? 0,
                    cache_read_tokens: event.message.usage.cache_read_input_tokens ?? 0,
                    cache_creation_tokens:
                      event.message.usage.cache_creation_input_tokens ?? 0,
                  });
                } else if (event.type === "message_delta" && event.usage) {
                  // message_delta carries the final output_tokens count for the
                  // turn — overwrite (not add) since message_start was 0.
                  iterUsage.output_tokens = event.usage.output_tokens ?? iterUsage.output_tokens;
                }
              }

              const finalMessage = await anthStream.finalMessage();
              finalMessageContent = finalMessage.content as unknown as ChatContentBlock[];
              finalStopReason = finalMessage.stop_reason;
              break; // success — exit retry loop
            } catch (streamErr) {
              // If any text was already streamed to the client, retrying
              // would duplicate it — bail to the outer catch.
              if (iterText.length > 0) throw streamErr;
              // Non-retryable (e.g., invalid_request_error) — bail too.
              if (!isRetryableAnthropicError(streamErr) || attempt === MAX_STREAM_ATTEMPTS) {
                throw streamErr;
              }
              // Exponential backoff: 1s, 2s. Capped to keep us under the 60s
              // route timeout even if we hit max attempts.
              const delayMs = Math.min(1000 * 2 ** (attempt - 1), 4000);
              await new Promise((r) => setTimeout(r, delayMs));
            }
          }

          if (!finalMessageContent) {
            // Defensive — retry loop above either succeeds or throws, so we
            // should never reach here. If we do, treat as error.
            throw new Error("Stream produced no final message");
          }

          const blocks = finalMessageContent;
          const iterCost = computeMessageCost(model, iterUsage);
          addUsage(cumulativeUsage, iterUsage);

          // PERSIST this iteration's assistant turn. Critical for multi-turn
          // (tool-using) conversations: when history reloads, the
          // tool_use ↔ tool_result pair must still be intact. Saving only
          // the final turn loses the tool_use blocks and produces a 400
          // from Anthropic on the next message.
          const { data: insertedAssistant } = await supabase
            .from("chat_messages")
            .insert({
              conversation_id: conversationId,
              user_id: user.id,
              role: "assistant",
              content: iterText,
              content_blocks: blocks,
              input_tokens: iterUsage.input_tokens,
              output_tokens: iterUsage.output_tokens,
              cache_read_tokens: iterUsage.cache_read_tokens,
              cache_creation_tokens: iterUsage.cache_creation_tokens,
              cost_usd: iterCost,
              model,
            })
            .select("id")
            .single();
          lastAssistantMessageId = insertedAssistant?.id ?? lastAssistantMessageId;
          currentIterRowPersisted = true;

          if (finalStopReason !== "tool_use") {
            // end_turn (or max_tokens) — done.
            break;
          }

          // Tool-use path: append assistant turn to in-memory history, run
          // tools, append tool_result blocks as a user turn, loop.
          messages.push({ role: "assistant", content: blocks });

          const toolResultBlocks: ChatContentBlock[] = [];
          for (const block of blocks) {
            if (block.type !== "tool_use") continue;
            const result = await runTool(
              block.name,
              block.input,
              { supabase, userId: user.id, sideEffects }
            );
            // Persist the tool execution as its own message row so the admin
            // panel can show the full timeline.
            const resultBlock: ChatContentBlock = {
              type: "tool_result",
              tool_use_id: block.id,
              content: result.content,
              is_error: result.isError,
            };
            toolResultBlocks.push(resultBlock);
            await supabase.from("chat_messages").insert({
              conversation_id: conversationId,
              user_id: user.id,
              role: "tool",
              content: `${getToolStatusLabel(block.name)} — done`,
              content_blocks: [resultBlock],
            });
            sseEvent(controller, "tool", {
              tool_name: block.name,
              status: "done",
              label: getToolStatusLabel(block.name),
            });
          }
          messages.push({ role: "user", content: toolResultBlocks });
        }

        // If the model escalated to a ticket during this turn, stamp the
        // last assistant row with the ticket id so the UI bubble can render
        // "Filed support ticket — view it →".
        if (sideEffects.ticketId && lastAssistantMessageId) {
          await supabase
            .from("chat_messages")
            .update({ created_ticket_id: sideEffects.ticketId })
            .eq("id", lastAssistantMessageId);
        }

        await supabase
          .from("chat_conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", conversationId);

        const cost = computeMessageCost(model, cumulativeUsage);
        sseEvent(controller, "done", {
          message_id: lastAssistantMessageId,
          usage: cumulativeUsage,
          cost_usd: cost,
        });
      } catch (err) {
        // Two paths into the catch:
        //   (a) Stream errored mid-reveal BEFORE the current iter's row was
        //       persisted. Save the partial text + error as a single row.
        //   (b) Tool execution or next-iter setup errored AFTER the current
        //       iter's row was already persisted in the loop body. In that
        //       case, don't write a duplicate assistant row — just append a
        //       short error note row so the transcript reflects the failure.
        // friendly is shown to the user. raw is kept in DB next to it so we
        // still have the original Anthropic error for debugging.
        const friendly = friendlyErrorMessage(err);
        const raw = err instanceof Error ? err.message : "Chat request failed";
        if (currentIterRowPersisted) {
          await supabase.from("chat_messages").insert({
            conversation_id: conversationId,
            user_id: user.id,
            role: "assistant",
            content: `[error] ${friendly}\n\n_(raw: ${raw})_`,
            model,
          });
        } else {
          const body = partialStreamedText
            ? `${partialStreamedText}\n\n[error: ${friendly}]`
            : `[error] ${friendly}`;
          await supabase.from("chat_messages").insert({
            conversation_id: conversationId,
            user_id: user.id,
            role: "assistant",
            content: body,
            model,
          });
        }
        sseEvent(controller, "error", { message: friendly });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!(await hasActiveSubscription(supabase, user.id))) {
    return new Response("Subscription required", { status: 402 });
  }

  const url = new URL(req.url);
  const includeArchived = url.searchParams.get("include_archived") === "1";

  let query = supabase
    .from("chat_conversations")
    .select("id, title, last_message_at, archived, created_at")
    .eq("user_id", user.id)
    .order("last_message_at", { ascending: false })
    .limit(100);

  if (!includeArchived) query = query.eq("archived", false);

  const { data, error } = await query;
  if (error) return new Response(error.message, { status: 500 });
  return Response.json({ conversations: data ?? [] });
}
