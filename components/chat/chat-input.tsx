"use client";

import { useRef, useEffect, KeyboardEvent } from "react";
import { Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  busy?: boolean;
  // Phase 6 will surface image attachments here; placeholder for now.
  // attachments?: string[];
}

export function ChatInput({ value, onChange, onSubmit, disabled, busy }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea up to a reasonable cap. Pure visual — value
  // stays in the parent state so streaming a reply doesn't blow away
  // unsent typing.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [value]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter inserts a newline. Standard chat UX.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled && !busy) onSubmit();
    }
  }

  return (
    <div className="flex items-end gap-2 px-3 py-3 border-t border-border-default/60 bg-surface">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask anything…"
        rows={1}
        disabled={disabled}
        className={cn(
          "flex-1 resize-none bg-bg-input border border-border-default rounded-xl px-3 py-2 text-sm",
          "text-foreground placeholder:text-muted-foreground/60",
          "focus:outline-none focus:ring-1 focus:ring-gold focus:border-gold/40",
          "transition-colors max-h-[140px]",
        )}
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={!value.trim() || disabled || busy}
        aria-label="Send message"
        className={cn(
          "shrink-0 size-9 rounded-full flex items-center justify-center transition-colors",
          "bg-gold text-primary-foreground hover:bg-[rgba(212,175,55,0.9)]",
          "disabled:opacity-40 disabled:cursor-not-allowed",
        )}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
      </button>
    </div>
  );
}
