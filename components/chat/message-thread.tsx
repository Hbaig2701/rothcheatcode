"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { MessageBubble } from "./message-bubble";
import { ChatInput } from "./chat-input";
import { useConversation, chatKeys } from "@/lib/queries/chat";
import { streamChat } from "@/lib/chat/stream-client";

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
  // Currently-streaming assistant text. Cleared once we re-fetch the
  // conversation (which then includes the persisted assistant message).
  const [streamingText, setStreamingText] = useState("");
  // Optimistic user message we just sent — displayed while the conversation
  // refetch is in flight so the UI doesn't appear to "lose" the message.
  const [optimisticUser, setOptimisticUser] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toolStatus, setToolStatus] = useState<ToolStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll to the bottom whenever the message set or streaming text
  // updates. Smooth on persistent messages, instant for streaming so the
  // chat keeps pace with the model.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [data?.messages, streamingText, optimisticUser, toolStatus]);

  // Cancel any in-flight stream if the user switches conversations.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, [conversationId]);

  async function handleSubmit() {
    const message = input.trim();
    if (!message || busy) return;

    setBusy(true);
    setError(null);
    setOptimisticUser(message);
    setStreamingText("");
    setToolStatus(null);
    setInput("");

    const controller = new AbortController();
    abortRef.current = controller;

    let createdConversationId: string | null = conversationId;

    try {
      await streamChat({
        conversationId,
        message,
        signal: controller.signal,
        handlers: {
          onMeta: ({ conversation_id }) => {
            createdConversationId = conversation_id;
            if (!conversationId) onConversationCreated(conversation_id);
          },
          onText: ({ text }) => {
            // Clear tool status the moment the assistant starts talking.
            setToolStatus(null);
            setStreamingText((prev) => prev + text);
          },
          onTool: ({ tool_name, status, label }) => {
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
      // Aborts are user-initiated (switching conversations) — don't show as error.
      if (m !== "AbortError" && !controller.signal.aborted) setError(m);
    } finally {
      setBusy(false);
      setOptimisticUser(null);
      setStreamingText("");
      setToolStatus(null);
      // Refetch persisted messages — this brings in both the user message
      // and the assistant message that the server saved.
      if (createdConversationId) {
        qc.invalidateQueries({ queryKey: chatKeys.conversation(createdConversationId) });
        qc.invalidateQueries({ queryKey: chatKeys.conversations() });
      }
    }
  }

  const messages = data?.messages ?? [];
  const isEmpty = !isLoading && messages.length === 0 && !optimisticUser && !streamingText;

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {isEmpty && <EmptyState />}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {optimisticUser && (
          <MessageBubble message={{ role: "user", content: optimisticUser }} />
        )}
        {toolStatus && (
          <div className="flex justify-start">
            <div className="text-xs italic text-muted-foreground bg-bg-card border border-border-default/50 rounded-full px-3 py-1.5">
              <Sparkles className="size-3 inline mr-1 text-gold" />
              {toolStatus.done ? `${toolStatus.label} — done` : `${toolStatus.label}…`}
            </div>
          </div>
        )}
        {streamingText && (
          <MessageBubble
            message={{ role: "assistant", content: streamingText }}
            streaming
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
        onSubmit={handleSubmit}
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
