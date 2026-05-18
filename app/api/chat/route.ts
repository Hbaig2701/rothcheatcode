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

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

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
  const attachments = (body.attachments ?? []).filter((u) => typeof u === "string");
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
  for (const row of priorRows ?? []) {
    // 'tool' rows belong on the user side as tool_result blocks. The blocks
    // are already shaped that way in content_blocks.
    if (row.role === "tool") {
      const blocks = (row.content_blocks ?? []) as ChatContentBlock[];
      if (blocks.length > 0) {
        messages.push({ role: "user", content: blocks });
      }
      continue;
    }
    const blocks = (row.content_blocks ?? null) as ChatContentBlock[] | null;
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
      let finalAssistantText = "";
      let finalAssistantBlocks: ChatContentBlock[] = [];
      // Filled by the create_support_ticket tool when the model decides to
      // escalate. Persisted to chat_messages.created_ticket_id at end-of-loop
      // so the admin panel + UI bubble can surface "filed ticket X" links.
      const sideEffects: { ticketId?: string } = {};

      try {
        for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
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

          let iterText = "";
          // Track which block index is a tool_use so we can emit the tool
          // status event as soon as Anthropic announces a tool block start.
          const announcedTools = new Set<number>();

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
              sseEvent(controller, "text", { text: event.delta.text });
            } else if (event.type === "message_start" && event.message.usage) {
              addUsage(cumulativeUsage, {
                input_tokens: event.message.usage.input_tokens ?? 0,
                output_tokens: event.message.usage.output_tokens ?? 0,
                cache_read_tokens: event.message.usage.cache_read_input_tokens ?? 0,
                cache_creation_tokens:
                  event.message.usage.cache_creation_input_tokens ?? 0,
              });
            } else if (event.type === "message_delta" && event.usage) {
              addUsage(cumulativeUsage, {
                output_tokens:
                  (event.usage.output_tokens ?? 0) -
                  // message_delta usage is cumulative for the turn, but
                  // message_start already counted the initial output_tokens
                  // (usually 0). Net add is the delta only.
                  0,
              });
            }
          }

          const finalMessage = await anthStream.finalMessage();
          const blocks = finalMessage.content as unknown as ChatContentBlock[];
          // Track the latest assistant text + blocks for persistence at the
          // end. If this turn ends with end_turn, these are what gets saved.
          finalAssistantText = iterText;
          finalAssistantBlocks = blocks;

          if (finalMessage.stop_reason !== "tool_use") {
            // end_turn (or max_tokens) — done.
            break;
          }

          // Tool-use path: append assistant turn to history, run tools, append
          // tool_result blocks as a user turn, loop.
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

        const cost = computeMessageCost(model, cumulativeUsage);

        const { data: persisted } = await supabase
          .from("chat_messages")
          .insert({
            conversation_id: conversationId,
            user_id: user.id,
            role: "assistant",
            content: finalAssistantText,
            content_blocks: finalAssistantBlocks,
            input_tokens: cumulativeUsage.input_tokens,
            output_tokens: cumulativeUsage.output_tokens,
            cache_read_tokens: cumulativeUsage.cache_read_tokens,
            cache_creation_tokens: cumulativeUsage.cache_creation_tokens,
            cost_usd: cost,
            model,
            // If create_support_ticket was called during this turn, stamp
            // the assistant message with the ticket id. UI shows a small
            // "Filed support ticket" note under the bubble; admin panel
            // can filter for AI-escalated tickets.
            created_ticket_id: sideEffects.ticketId ?? null,
          })
          .select("id")
          .single();

        await supabase
          .from("chat_conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", conversationId);

        sseEvent(controller, "done", {
          message_id: persisted?.id,
          usage: cumulativeUsage,
          cost_usd: cost,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Chat request failed";
        await supabase.from("chat_messages").insert({
          conversation_id: conversationId,
          user_id: user.id,
          role: "assistant",
          content: finalAssistantText || `[error] ${message}`,
          model,
        });
        sseEvent(controller, "error", { message });
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
