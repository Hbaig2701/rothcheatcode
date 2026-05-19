"use client";

import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatLauncherProps {
  onClick: () => void;
  // When the drawer is open we hide the launcher (the drawer's own header
  // owns the close button). When minimized we keep the launcher visible
  // and may show an unread indicator.
  hidden?: boolean;
  hasUnread?: boolean;
}

/**
 * Floating "Ask AI" button in the bottom-right corner. Always visible on
 * dashboard pages unless the chat drawer is fully open.
 */
export function ChatLauncher({ onClick, hidden, hasUnread }: ChatLauncherProps) {
  if (hidden) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open AI assistant (beta)"
      className={cn(
        "fixed bottom-6 right-6 z-40 flex items-center gap-2.5 px-4 py-3 rounded-full",
        "bg-gold text-primary-foreground font-medium text-sm shadow-xl shadow-black/20",
        "hover:bg-[rgba(212,175,55,0.9)] transition-all hover:-translate-y-0.5",
      )}
    >
      <MessageCircle className="size-4" />
      <span>Ask AI</span>
      <span
        // Inline beta tag on the launcher so advisors are reminded the
        // assistant is experimental every time they open it.
        className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary-foreground/20 text-primary-foreground"
      >
        Beta
      </span>
      {hasUnread && (
        <span
          aria-label="Unread reply"
          className="absolute -top-1 -right-1 size-3 rounded-full bg-red-500 border-2 border-background"
        />
      )}
    </button>
  );
}
