"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { MessageBubble } from "./message-bubble";
import { ChatInput } from "./chat-input";
import { useConversation, chatKeys } from "@/lib/queries/chat";
import { streamChat } from "@/lib/chat/stream-client";
import { useTypewriter } from "@/lib/chat/typewriter";

interface MessageThreadProps {
  conversationId: string | null;
  onConversationCreated: (newId: string) => void;
}

interface ToolStatus {
  // Identifier from the model. We keep the latest tool's display label so
  // the indicator can update as the model chains tools.
  label: string;
  // Set when status flips to 'done' so the UI can briefly show "done" before
  // the next tool starts or the text reply begins.
  done?: boolean;
}

/**
 * Main message-thread view inside the chat drawer. Loads persisted messages
 * for the active conversation, accepts new user input, streams the assistant
 * reply, and shows a tool-call status indicator while client lookups run
 * (Phase 5 wires the actual tools — the UI machinery is in place).
 */
export function MessageThread({ conversationId, onConversationCreated }: MessageThreadProps) {
  const qc = useQueryClient();
  const { data, isLoading } = useConversation(conversationId);

  const [input, setInput] = useState("");
  // Smoothed reveal of the streaming assistant text. SSE chunks land in
  // the typewriter buffer; useTypewriter exposes a steady-rate revealed
  // string we render in the bubble. Calibrated at ~35 cps so a typical
  // 200-char reply takes ~6 seconds to fully type out — feels considered
  // and gives the advisor time to read along instead of dumping the
  // answer the moment the model finishes generating.
  const typewriter = useTypewriter();
  const streamingText = typewriter.text;
  // Optimistic user message we just sent — displayed while the conversation
  // refetch is in flight so the UI doesn't appear to "lose" the message.
  const [optimisticUser, setOptimisticUser] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toolStatus, setToolStatus] = useState<ToolStatus | null>(null);
  // Once any tool has fired in the current turn, all subsequent streamed
  // text is rendered as compact "thinking" text rather than a full bubble
  // — it's almost always intermediate commentary, not the final answer.
  // The persisted final assistant message takes over as a full bubble
  // when the stream ends and the conversation refetches.
  const [hasUsedTools, setHasUsedTools] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Track the conversation that owns the in-flight stream so we only abort
  // on a real SWITCH (clicking a different convo). Setting conversationId
  // from null → new-id during the first message's stream must NOT abort:
  // that's the new conversation that just got created server-side.
  const streamingConvoRef = useRef<string | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [data?.messages, streamingText, optimisticUser, toolStatus]);

  // Abort the in-flight stream only when switching to a DIFFERENT
  // conversation (e.g., user picked another thread from the sidebar). A
  // null → id transition is the "new conversation being created" case and
  // must not abort the stream that just created it.
  useEffect(() => {
    if (
      streamingConvoRef.current !== null &&
      conversationId !== null &&
      streamingConvoRef.current !== conversationId
    ) {
      abortRef.current?.abort();
    }
  }, [conversationId]);

  async function handleSubmit(message: string, attachments: string[]) {
    if ((!message && attachments.length === 0) || busy) return;

    setBusy(true);
    setError(null);
    setOptimisticUser(message);
    typewriter.reset();
    setToolStatus(null);
    setHasUsedTools(false);
    setInput("");

    const controller = new AbortController();
    abortRef.current = controller;
    streamingConvoRef.current = conversationId;

    let createdConversationId: string | null = conversationId;

    try {
      await streamChat({
        conversationId,
        message,
        attachments,
        signal: controller.signal,
        handlers: {
          onMeta: ({ conversation_id }) => {
            createdConversationId = conversation_id;
            // Update streamingConvoRef BEFORE the parent state change fires.
            // Otherwise the [conversationId] effect runs with stale data
            // and thinks this is a switch.
            streamingConvoRef.current = conversation_id;
            if (!conversationId) onConversationCreated(conversation_id);
          },
          onText: ({ text }) => {
            setToolStatus(null);
            typewriter.append(text);
          },
          onTool: ({ tool_name, status, label }) => {
            if (status === "running") setHasUsedTools(true);
            setToolStatus({
              label: label || tool_name,
              done: status === "done",
            });
          },
          onError: ({ message }) => {
            setError(message);
          },
        },
      });
    } catch (err) {
      const m = err instanceof Error ? err.message : "Chat failed";
      if (m !== "AbortError" && !controller.signal.aborted) setError(m);
    } finally {
      // Wait for the typewriter to naturally finish revealing whatever
      // text is still buffered before we hand off to the persisted
      // version. Without the await, the bubble jumps from mid-reveal to
      // fully typed the moment the stream ends — abrupt and unsatisfying.
      // With it, the reveal completes calmly and the cache hand-off is
      // invisible.
      await typewriter.finish();
      // Refetch persisted messages FIRST so the cache has the saved user +
      // assistant rows; THEN clear streaming state. Avoids the flash where
      // neither version is visible between stream-end and refetch-land.
      if (createdConversationId) {
        await Promise.all([
          qc.invalidateQueries({ queryKey: chatKeys.conversation(createdConversationId) }),
          qc.invalidateQueries({ queryKey: chatKeys.conversations() }),
        ]);
      }
      setBusy(false);
      setOptimisticUser(null);
      typewriter.reset();
      setToolStatus(null);
      setHasUsedTools(false);
      streamingConvoRef.current = null;
    }
  }

  const messages = data?.messages ?? [];
  const isEmpty = !isLoading && messages.length === 0 && !optimisticUser && !streamingText;
  // When meta fires mid-stream on a brand new conversation, useConversation
  // refetches and the persisted user message (saved server-side BEFORE the
  // stream started) lands in `messages`. Without this check, both the
  // optimistic bubble AND the persisted one render — the user sees their
  // message twice.
  const lastPersistedUser = [...messages].reverse().find((m) => m.role === "user");
  const showOptimisticUser = !!optimisticUser && lastPersistedUser?.content !== optimisticUser;

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {isEmpty && <EmptyState />}
        {messages.map((m) => (
          // content_blocks is needed so MessageBubble can detect
          // intermediate assistant turns (those that include tool_use blocks)
          // and render them as compact "thinking" notes rather than full
          // bubbles competing with the final answer.
          <MessageBubble
            key={m.id}
            message={{
              id: m.id,
              role: m.role,
              content: m.content,
              attachment_url: m.attachment_url,
              created_ticket_id: m.created_ticket_id,
              content_blocks: m.content_blocks,
            }}
          />
        ))}
        {showOptimisticUser && (
          <MessageBubble message={{ role: "user", content: optimisticUser! }} />
        )}
        {toolStatus && (
          <div className="flex justify-start">
            <div className="text-xs italic text-muted-foreground bg-bg-card border border-border-default/50 rounded-full px-3 py-1.5">
              <Sparkles className="size-3 inline mr-1 text-gold" />
              {toolStatus.done ? `${toolStatus.label} — done` : `${toolStatus.label}…`}
            </div>
          </div>
        )}
        {/* When tools have fired this turn AND there's streaming text but no
            active tool pill, the model is mid-iteration writing intermediate
            commentary or the final answer. We don't show the text — just a
            generic "Thinking…" pill so the advisor sees the gears turning
            without being drowned in the model's internal monologue. */}
        {streamingText && hasUsedTools && !toolStatus && (
          <div className="flex justify-start">
            <div className="text-xs italic text-muted-foreground bg-bg-card border border-border-default/50 rounded-full px-3 py-1.5">
              <Sparkles className="size-3 inline mr-1 text-gold animate-pulse" />
              Thinking…
            </div>
          </div>
        )}
        {streamingText && (
          <MessageBubble
            message={{ role: "assistant", content: streamingText }}
            streaming
            thinking={hasUsedTools}
          />
        )}
        {error && (
          <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>

      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={(msg, atts) => void handleSubmit(msg, atts)}
        busy={busy}
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12 gap-3">
      <div className="size-12 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center">
        <Sparkles className="size-5 text-gold" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">How can I help?</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">
          Ask about your reports, theory and math, or specific client numbers. I&apos;ll explain things in plain English.
        </p>
      </div>
    </div>
  );
}
