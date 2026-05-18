"use client";

import { useState } from "react";
import { Menu, X, Minimize2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";
import { useConversation } from "@/lib/queries/chat";

interface ChatDrawerProps {
  open: boolean;
  onMinimize: () => void;
  onClose: () => void;
}

/**
 * Slide-in chat panel anchored to the bottom-right. Contains the message
 * thread by default; the conversation list slides over from the left edge
 * when the user clicks the menu icon.
 *
 * The active conversation id lives here (not in the widget) so closing /
 * minimizing the drawer doesn't lose the current thread.
 */
export function ChatDrawer({ open, onMinimize, onClose }: ChatDrawerProps) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);

  const { data: activeConvo } = useConversation(conversationId);
  const title = activeConvo?.conversation.title || "New conversation";

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-40",
        "w-[400px] max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-4rem)]",
        "rounded-2xl bg-surface border border-border-default shadow-2xl shadow-black/30",
        "flex flex-col overflow-hidden transition-all duration-200",
        open
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-2 pointer-events-none",
      )}
      role="dialog"
      aria-label="AI assistant"
      aria-hidden={!open}
    >
      <div className="flex items-center gap-2 px-3 h-12 border-b border-border-default/60 bg-surface-elevated">
        <button
          type="button"
          onClick={() => setListOpen(true)}
          aria-label="Show conversations"
          className="size-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-bg-input"
        >
          <Menu className="size-4" />
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{title}</p>
        </div>

        <button
          type="button"
          onClick={() => setConversationId(null)}
          aria-label="New conversation"
          className="size-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-bg-input"
        >
          <Plus className="size-4" />
        </button>
        <button
          type="button"
          onClick={onMinimize}
          aria-label="Minimize"
          className="size-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-bg-input"
        >
          <Minimize2 className="size-4" />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="size-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-bg-input"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 relative">
        <MessageThread
          conversationId={conversationId}
          onConversationCreated={setConversationId}
        />
        <ConversationList
          open={listOpen}
          onClose={() => setListOpen(false)}
          activeConversationId={conversationId}
          onSelect={(id) => setConversationId(id)}
        />
      </div>
    </div>
  );
}
