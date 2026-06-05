/**
 * Browser-side SSE parser for /api/chat. The endpoint streams `event: NAME`
 * + `data: JSON` pairs separated by blank lines. EventSource doesn't support
 * POST bodies, so we read the fetch response stream manually.
 *
 * Callbacks receive parsed event payloads — no JSON.parse boilerplate at
 * call sites. Returns a Promise that resolves on `done` and rejects on
 * `error` or transport failure.
 */

export interface ChatStreamHandlers {
  onMeta?: (data: { conversation_id: string }) => void;
  onText?: (data: { text: string }) => void;
  // Phase 5 — tool status updates (e.g., "Looking up client X").
  onTool?: (data: { tool_name: string; status: "running" | "done"; label?: string }) => void;
  onDone?: (data: {
    message_id?: string;
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_read_tokens: number;
      cache_creation_tokens: number;
    };
    cost_usd: number;
  }) => void;
  onError?: (data: { message: string }) => void;
}

// Snapshot of what the advisor is looking at when they sent the message.
// The server uses this to inject a "Page context" block into the system
// prompt so the bot doesn't ask "which client?" when the answer is in
// the URL bar. Pass `null` (the default) for off-app or context-less
// surfaces — the server treats absence as "no context available."
export interface ChatPageContext {
  pathname?: string | null;
  // If the page is a client-scoped one, the resolved client_id from the
  // URL. The server validates this against RLS (the advisor must own the
  // client) before injecting anything into the prompt.
  clientId?: string | null;
}

export interface ChatStreamArgs {
  conversationId?: string | null;
  message: string;
  attachments?: string[];
  pageContext?: ChatPageContext | null;
  signal?: AbortSignal;
  handlers: ChatStreamHandlers;
}

export async function streamChat({
  conversationId,
  message,
  attachments,
  pageContext,
  signal,
  handlers,
}: ChatStreamArgs): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversation_id: conversationId ?? null,
      message,
      attachments,
      page_context: pageContext ?? null,
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Chat request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  // Buffer accumulates partial chunks. SSE events end with a blank line
  // ("\n\n"); we split on that to find complete events.
  let buffer = "";
  let saw_done = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let eventEnd = buffer.indexOf("\n\n");
    while (eventEnd !== -1) {
      const rawEvent = buffer.slice(0, eventEnd);
      buffer = buffer.slice(eventEnd + 2);
      eventEnd = buffer.indexOf("\n\n");

      // Parse out event name + data. Lines that aren't event:/data: are
      // ignored (comments, keep-alives).
      let eventName = "message";
      let dataLines: string[] = [];
      for (const line of rawEvent.split("\n")) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(dataLines.join("\n"));
      } catch {
        continue;
      }

      switch (eventName) {
        case "meta":
          handlers.onMeta?.(parsed as { conversation_id: string });
          break;
        case "text":
          handlers.onText?.(parsed as { text: string });
          break;
        case "tool":
          handlers.onTool?.(parsed as { tool_name: string; status: "running" | "done"; label?: string });
          break;
        case "done":
          saw_done = true;
          handlers.onDone?.(parsed as Parameters<NonNullable<ChatStreamHandlers["onDone"]>>[0]);
          break;
        case "error":
          handlers.onError?.(parsed as { message: string });
          throw new Error((parsed as { message?: string }).message || "Chat stream error");
      }
    }
  }

  if (!saw_done) {
    // Server closed the stream without sending `done` — treat as a soft
    // failure so the UI knows the response is incomplete.
    handlers.onError?.({ message: "Connection ended before the response completed" });
  }
}
