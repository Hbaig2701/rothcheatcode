"use client";

import { useState } from "react";
import { Plus, MessageSquare, Trash2, Archive, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useConversations,
  useArchiveConversation,
  useDeleteConversation,
  type ConversationListItem,
} from "@/lib/queries/chat";

interface ConversationListProps {
  open: boolean;
  onClose: () => void;
  activeConversationId: string | null;
  onSelect: (id: string | null) => void; // null = new conversation
}

/**
 * Slide-over panel inside the chat drawer. Shows the advisor's past
 * conversations, lets them switch / start a new one / archive / delete.
 * Closes itself when a conversation is picked so the message thread is
 * visible again.
 */
export function ConversationList({
  open,
  onClose,
  activeConversationId,
  onSelect,
}: ConversationListProps) {
  const { data: conversations, isLoading } = useConversations();
  const archive = useArchiveConversation();
  const del = useDeleteConversation();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  return (
    <div
      className={cn(
        "absolute inset-0 z-10 bg-surface transition-transform duration-200",
        open ? "translate-x-0" : "-translate-x-full pointer-events-none",
      )}
    >
      <div className="flex items-center justify-between px-4 h-12 border-b border-border-default/60">
        <span className="text-sm font-medium text-foreground">Conversations</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close conversation list"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="p-3">
        <button
          type="button"
          onClick={() => {
            onSelect(null);
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-bg-card hover:bg-bg-input border border-border-default/60 text-sm font-medium text-foreground transition-colors"
        >
          <Plus className="size-4 text-gold" />
          New conversation
        </button>
      </div>

      <div className="overflow-y-auto px-2 pb-3" style={{ maxHeight: "calc(100% - 7rem)" }}>
        {isLoading ? (
          <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>
        ) : !conversations || conversations.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No conversations yet. Start a new one to get going.
          </div>
        ) : (
          <ul className="space-y-1">
            {conversations.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                active={c.id === activeConversationId}
                onSelect={() => {
                  onSelect(c.id);
                  onClose();
                }}
                onArchive={() => archive.mutate({ id: c.id, archived: true })}
                onDelete={() => setConfirmDeleteId(c.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {confirmDeleteId && (
        <div className="absolute inset-x-3 bottom-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs">
          <p className="text-foreground mb-2">Delete this conversation? This can&apos;t be undone.</p>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setConfirmDeleteId(null)}
              className="px-2 py-1 rounded border border-border-default text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                del.mutate(confirmDeleteId);
                if (confirmDeleteId === activeConversationId) onSelect(null);
                setConfirmDeleteId(null);
              }}
              className="px-2 py-1 rounded bg-red-500 text-white"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConversationRow({
  conversation,
  active,
  onSelect,
  onArchive,
  onDelete,
}: {
  conversation: ConversationListItem;
  active: boolean;
  onSelect: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="group relative">
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "w-full text-left px-2.5 py-2 rounded-lg flex items-start gap-2 transition-colors",
          active ? "bg-bg-card border border-gold/30" : "hover:bg-bg-card border border-transparent",
        )}
      >
        <MessageSquare className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
        <span className="flex-1 min-w-0">
          <span className="block text-xs text-foreground truncate">
            {conversation.title || "New conversation"}
          </span>
          <span className="block text-[10px] text-muted-foreground mt-0.5">
            {new Date(conversation.last_message_at).toLocaleDateString()}
          </span>
        </span>
      </button>
      <div className="absolute right-1.5 top-1.5 hidden group-hover:flex gap-0.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onArchive();
          }}
          aria-label="Archive conversation"
          className="size-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-bg-input"
        >
          <Archive className="size-3" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label="Delete conversation"
          className="size-6 rounded flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-bg-input"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    </li>
  );
}
