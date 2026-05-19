"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types/chat";

/**
 * Normalize assistant text for markdown rendering:
 *
 *   - Single \\n between non-empty lines becomes \\n\\n. The model often
 *     emits one newline between paragraphs; markdown treats that as a soft
 *     break and collapses them into one paragraph, defeating the prose
 *     paragraph spacing. Promoting single newlines to double preserves the
 *     model's intended structure.
 *   - Em (U+2014) and en (U+2013) dashes get replaced with regular hyphens.
 *     The tone prompt forbids them but the model leaks them anyway; this
 *     is the defense layer that keeps them out of advisor-facing UI.
 */
function normalizeAssistantText(raw: string): string {
  return raw
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/([^\n])\n([^\n])/g, "$1\n\n$2");
}

interface MessageBubbleProps {
  // Subset of ChatMessage that the bubble needs to render. Stream-in-progress
  // messages aren't persisted yet, so we accept a lighter shape too.
  message: {
    role: ChatMessage["role"];
    content: string;
    attachment_url?: string | null;
    created_ticket_id?: string | null;
    // Present on persisted assistant rows. If this contains any tool_use
    // blocks, the row is an INTERMEDIATE turn (the model wrote some text
    // then called a tool) — render compactly so it doesn't compete with
    // the final answer below it.
    content_blocks?: unknown;
  };
  // Show a typing/streaming indicator after the content (used for the
  // currently-generating assistant message).
  streaming?: boolean;
}

// Cheap check — content_blocks is jsonb from the DB, shaped as an array of
// Anthropic content blocks. We only need to know if any have type "tool_use".
function isIntermediateAssistantTurn(blocks: unknown): boolean {
  if (!Array.isArray(blocks)) return false;
  for (const b of blocks) {
    if (b && typeof b === "object" && (b as { type?: string }).type === "tool_use") {
      return true;
    }
  }
  return false;
}

export function MessageBubble({ message, streaming }: MessageBubbleProps) {
  // Memoize the normalized text so re-renders during streaming don't rerun
  // the regex passes on every typewriter tick.
  const normalizedContent = useMemo(
    () => (message.role === "assistant" ? normalizeAssistantText(message.content) : message.content),
    [message.role, message.content],
  );

  if (message.role === "tool") {
    // Tool status lines render as a thin centered note, not a bubble.
    return (
      <div className="flex justify-center py-1.5">
        <span className="text-xs text-muted-foreground italic">{message.content}</span>
      </div>
    );
  }

  // Intermediate assistant turns ("Let me check year 1…" before a tool
  // call) render as compact, italicized "thinking" text instead of a full
  // bubble — so they don't compete visually with the final answer that
  // comes after the tool. Streaming bubbles are always rendered full-size
  // (we don't know yet whether the model is about to call a tool).
  const isIntermediate =
    message.role === "assistant" &&
    !streaming &&
    !!message.content?.trim() &&
    isIntermediateAssistantTurn(message.content_blocks);

  if (isIntermediate) {
    return (
      <div className="flex justify-start px-1 py-0.5">
        <p className="text-xs text-muted-foreground italic leading-relaxed max-w-[90%] whitespace-pre-wrap">
          {normalizedContent}
        </p>
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
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : streaming ? (
          // While streaming, render plain text split on any newline so the
          // model's paragraph breaks get real visual spacing instead of
          // collapsing into one wall. Single \\n is treated as a paragraph
          // break too (it's how the model actually writes most of the time).
          <div className="leading-relaxed">
            {normalizedContent.split(/\n+/).map((para, i, all) => {
              const isLast = i === all.length - 1;
              return (
                <p
                  key={i}
                  className={cn("whitespace-pre-wrap", !isLast && "mb-3")}
                >
                  {para}
                  {isLast && (
                    <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-foreground/60 animate-pulse rounded-sm align-middle" />
                  )}
                </p>
              );
            })}
          </div>
        ) : (
          // Persisted markdown render. normalizedContent promoted single \\n
          // to \\n\\n upstream so markdown actually treats paragraph breaks
          // as paragraph breaks.
          <div
            className={cn(
              "prose prose-sm max-w-none",
              "prose-p:my-3 prose-p:leading-relaxed",
              "prose-ul:my-3 prose-ol:my-3 prose-li:my-1",
              "prose-strong:text-foreground prose-strong:font-semibold",
              "dark:prose-invert",
            )}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{normalizedContent}</ReactMarkdown>
          </div>
        )}
      </div>
      {message.created_ticket_id && (
        <a
          href={`/support/${message.created_ticket_id}`}
          className="text-xs text-gold italic hover:underline inline-flex items-center gap-1"
        >
          Filed support ticket on your behalf — view it →
        </a>
      )}
    </div>
  );
}
