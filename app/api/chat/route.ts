/**
 * POST /api/chat — send a message in a conversation, stream the response.
 *
 * Wire format: Server-Sent Events. The client decodes a stream of `event:` /
 * `data:` pairs. Phase 2 emits four event types — meta (conversation id),
 * text (assistant text deltas), done (final usage + cost), and error.
 * Phase 5 will add `tool` events for tool-call status indicators.
 *
 * Persistence happens server-side regardless of whether the client stays
 * connected: the user message is written before Anthropic is called, and
 * the assistant message is written when the stream finishes. So if an
 * advisor closes their browser mid-response, they still see the completed
 * reply next time they open the widget.
 */
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropic, CHAT_MODEL_DEFAULT, computeMessageCost } from "@/lib/chat/anthropic";
import { buildSystemPrompt } from "@/lib/chat/system-prompt";
import type { ChatMessage, ChatContentBlock } from "@/lib/types/chat";

export const dynamic = "force-dynamic";
// Streaming responses can take longer than the default 10s on Vercel.
// 60s is enough headroom for a long answer with several tool calls (Phase 5).
export const maxDuration = 60;

interface PostBody {
  conversation_id?: string | null;
  message: string;
  // Optional list of attachment URLs (uploaded to Supabase storage by the
  // client before posting). Phase 6 wires the storage bucket; Phase 2 just
  // passes them through to Anthropic as image blocks if present.
  attachments?: string[];
}

// SSE wire-format helpers. Each event is `event: NAME\ndata: JSON\n\n`.
function sseEvent(controller: ReadableStreamDefaultController, name: string, data: unknown) {
  const payload = `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(new TextEncoder().encode(payload));
}

// Derive a short title from the first user message. Pure first-60-chars
// slice — model-generated titles would be nicer but cost an extra API call
// per new conversation. Can upgrade later if advisor feedback warrants it.
function deriveTitle(userMessage: string): string {
  const trimmed = userMessage.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 60) return trimmed;
  return trimmed.slice(0, 57) + "...";
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

  // 1. Resolve conversation. Create one if no id was passed; verify ownership
  //    when an id is passed (RLS covers reads but the explicit check keeps
  //    the error path tidy).
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

  // 2. Persist the user message immediately. If Anthropic errors out below,
  //    we still want the user's message in the history.
  const attachments = (body.attachments ?? []).filter((u) => typeof u === "string");
  const userContentBlocks: ChatContentBlock[] = [
    ...attachments.map((url) => ({
      type: "image" as const,
      source: { type: "url" as const, url },
    })),
    { type: "text" as const, text: body.message },
  ];
  await supabase.from("chat_messages").insert({
    conversation_id: conversationId,
    user_id: user.id,
    role: "user",
    content: body.message,
    content_blocks: userContentBlocks,
    attachment_url: attachments[0] ?? null,
  });

  // 3. Load conversation history (oldest → newest, last 20). Drop tool rows
  //    for Phase 2 — they show up in the admin panel but the model doesn't
  //    need them in context. Phase 5 will replace this with proper threading
  //    that preserves tool_use ↔ tool_result pairs.
  const { data: priorRows } = await supabase
    .from("chat_messages")
    .select("role, content, content_blocks")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  const history = (priorRows ?? [])
    .filter((r) => r.role === "user" || r.role === "assistant")
    .map((r) => {
      const blocks = (r.content_blocks ?? null) as ChatContentBlock[] | null;
      if (blocks && blocks.length > 0) {
        return { role: r.role as "user" | "assistant", content: blocks };
      }
      return { role: r.role as "user" | "assistant", content: r.content };
    });

  // 4. Stream from Anthropic and pipe SSE to the client. Persistence of the
  //    assistant message happens at the end (after the stream closes), so a
  //    disconnect mid-stream still produces a saved row.
  const anthropic = getAnthropic();
  const model = CHAT_MODEL_DEFAULT;
  const systemBlocks = buildSystemPrompt();

  const stream = new ReadableStream({
    async start(controller) {
      // Echo conversation_id so the client can store it (new conversation case).
      sseEvent(controller, "meta", { conversation_id: conversationId });

      let assistantText = "";
      let usage = {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
      };

      try {
        const anthStream = anthropic.messages.stream({
          model,
          max_tokens: 1024,
          system: systemBlocks,
          messages: history,
        });

        for await (const event of anthStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            assistantText += event.delta.text;
            sseEvent(controller, "text", { text: event.delta.text });
          } else if (event.type === "message_start" && event.message.usage) {
            // Initial usage on message_start gives us input + cache fields.
            usage = {
              input_tokens: event.message.usage.input_tokens ?? 0,
              output_tokens: event.message.usage.output_tokens ?? 0,
              cache_read_tokens: event.message.usage.cache_read_input_tokens ?? 0,
              cache_creation_tokens: event.message.usage.cache_creation_input_tokens ?? 0,
            };
          } else if (event.type === "message_delta" && event.usage) {
            // message_delta carries the final output_tokens count.
            usage.output_tokens = event.usage.output_tokens ?? usage.output_tokens;
          }
        }

        const finalMessage = await anthStream.finalMessage();
        // finalMessage.usage is authoritative — overwrite the accumulated values.
        if (finalMessage.usage) {
          usage = {
            input_tokens: finalMessage.usage.input_tokens ?? 0,
            output_tokens: finalMessage.usage.output_tokens ?? 0,
            cache_read_tokens: finalMessage.usage.cache_read_input_tokens ?? 0,
            cache_creation_tokens: finalMessage.usage.cache_creation_input_tokens ?? 0,
          };
        }

        const cost = computeMessageCost(model, usage);

        // Capture the full content_blocks array as Anthropic returned it.
        const responseBlocks = finalMessage.content as unknown as ChatContentBlock[];

        const { data: persisted } = await supabase
          .from("chat_messages")
          .insert({
            conversation_id: conversationId,
            user_id: user.id,
            role: "assistant",
            content: assistantText,
            content_blocks: responseBlocks,
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            cache_read_tokens: usage.cache_read_tokens,
            cache_creation_tokens: usage.cache_creation_tokens,
            cost_usd: cost,
            model,
          })
          .select("id")
          .single();

        // Bump last_message_at so the conversation list sorts correctly.
        await supabase
          .from("chat_conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", conversationId);

        sseEvent(controller, "done", {
          message_id: persisted?.id,
          usage,
          cost_usd: cost,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Chat request failed";
        // Persist a placeholder assistant row so the conversation history
        // reflects the failure (the advisor saw an error; the log should too).
        await supabase.from("chat_messages").insert({
          conversation_id: conversationId,
          user_id: user.id,
          role: "assistant",
          content: assistantText || `[error] ${message}`,
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

/**
 * GET /api/chat — list conversations for the signed-in user. Order is
 * most-recent first; archived conversations are filtered out by default
 * (admin panel uses ?include_archived=1 to see them too).
 */
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
