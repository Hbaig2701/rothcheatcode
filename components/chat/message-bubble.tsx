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
  // True if any tool has fired in this turn. When true and the message is
  // still streaming, render in the compact "thinking" style instead of a
  // full bubble — the streamed text is almost certainly more intermediate
  // commentary, not the final answer, so it shouldn't compete visually.
  // The final answer takes over as a full bubble once it's persisted.
  thinking?: boolean;
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

export function MessageBubble({ message, streaming, thinking }: MessageBubbleProps) {
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

  // Persisted intermediate assistant turns (assistant row with a tool_use
  // block in its content) — render as compact italic "thinking" text so
  // they don't compete with the final answer. These are historical, so we
  // do show the text for context if the advisor scrolls back.
  const isPersistedIntermediate =
    message.role === "assistant" &&
    !streaming &&
    !!message.content?.trim() &&
    isIntermediateAssistantTurn(message.content_blocks);

  if (isPersistedIntermediate) {
    return (
      <div className="flex justify-start px-1 py-0.5">
        <p className="text-xs text-muted-foreground italic leading-relaxed max-w-[90%] whitespace-pre-wrap">
          {normalizedContent}
        </p>
      </div>
    );
  }

  // Currently-streaming turn AFTER tools have started firing. Don't show
  // the model's intermediate commentary at all — it's noise. The
  // MessageThread renders a "Thinking…" pill in this case (no body
  // content). When the final answer finishes streaming, the persisted
  // bubble takes over.
  if (streaming && thinking) {
    return null;
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
          // as paragraph breaks. The @tailwindcss/typography plugin is NOT
          // installed in this project (Tailwind v4 setup), so `prose`
          // classes have no effect — element-by-element styling is applied
          // explicitly via the components prop instead.
          <div className="text-sm leading-relaxed space-y-3">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p className="leading-relaxed">{children}</p>,
                ul: ({ children }) => <ul className="list-disc pl-5 space-y-1">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1">{children}</ol>,
                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                em: ({ children }) => <em className="italic">{children}</em>,
                code: ({ children }) => <code className="px-1 py-0.5 rounded bg-bg-card-hover text-xs font-mono">{children}</code>,
                a: ({ href, children }) => <a href={href} className="text-gold underline hover:no-underline" target="_blank" rel="noreferrer">{children}</a>,
                h1: ({ children }) => <h3 className="text-base font-semibold mt-1">{children}</h3>,
                h2: ({ children }) => <h3 className="text-base font-semibold mt-1">{children}</h3>,
                h3: ({ children }) => <h3 className="text-sm font-semibold mt-1">{children}</h3>,
              }}
            >
              {normalizedContent}
            </ReactMarkdown>
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
