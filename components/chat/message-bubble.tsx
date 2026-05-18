"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types/chat";

interface MessageBubbleProps {
  // Subset of ChatMessage that the bubble needs to render. Stream-in-progress
  // messages aren't persisted yet, so we accept a lighter shape too.
  message: {
    role: ChatMessage["role"];
    content: string;
    attachment_url?: string | null;
    created_ticket_id?: string | null;
  };
  // Show a typing/streaming indicator after the content (used for the
  // currently-generating assistant message).
  streaming?: boolean;
}

export function MessageBubble({ message, streaming }: MessageBubbleProps) {
  if (message.role === "tool") {
    // Tool status lines render as a thin centered note, not a bubble. Phase 5
    // will animate these while the tool is running.
    return (
      <div className="flex justify-center py-1.5">
        <span className="text-xs text-muted-foreground italic">{message.content}</span>
      </div>
    );
  }

  const isUser = message.role === "user";

  return (
    <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
      {message.attachment_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={message.attachment_url}
          alt="Attachment"
          className="max-w-[280px] max-h-[200px] rounded-lg border border-border-default object-cover"
        />
      )}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-gold/90 text-primary-foreground rounded-br-md"
            : "bg-bg-card text-foreground border border-border-default/50 rounded-bl-md",
        )}
      >
        {isUser ? (
          // User messages render as plain text (preserves line breaks).
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          // Assistant messages render markdown so the model can use inline
          // emphasis / code spans / occasional links — but the tone prompt
          // discourages heavy formatting so most messages will be plain prose.
          <div
            className={cn(
              "prose prose-sm max-w-none",
              "prose-p:my-1.5 prose-p:leading-relaxed",
              "prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5",
              "prose-strong:text-foreground prose-strong:font-semibold",
              "dark:prose-invert",
            )}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            {streaming && (
              <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-foreground/60 animate-pulse rounded-sm align-middle" />
            )}
          </div>
        )}
      </div>
      {message.created_ticket_id && (
        <span className="text-xs text-muted-foreground italic">
          Filed support ticket on your behalf.
        </span>
      )}
    </div>
  );
}
