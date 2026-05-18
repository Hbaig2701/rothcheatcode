"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ChatConversation, ChatMessage } from "@/lib/types/chat";

export const chatKeys = {
  all: ["chat"] as const,
  conversations: () => [...chatKeys.all, "conversations"] as const,
  conversation: (id: string) => [...chatKeys.conversations(), id] as const,
};

export interface ConversationListItem {
  id: string;
  title: string | null;
  last_message_at: string;
  archived: boolean;
  created_at: string;
}

export function useConversations() {
  return useQuery({
    queryKey: chatKeys.conversations(),
    queryFn: async (): Promise<ConversationListItem[]> => {
      const res = await fetch("/api/chat");
      if (!res.ok) throw new Error("Failed to load conversations");
      const data = (await res.json()) as { conversations: ConversationListItem[] };
      return data.conversations;
    },
    // Conversations don't change without user action — short stale time is fine.
    staleTime: 30_000,
  });
}

export interface ConversationDetail {
  conversation: ChatConversation;
  messages: ChatMessage[];
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: id ? chatKeys.conversation(id) : ["chat", "conversations", "none"],
    enabled: !!id,
    queryFn: async (): Promise<ConversationDetail> => {
      const res = await fetch(`/api/chat/conversations/${id}`);
      if (!res.ok) throw new Error("Failed to load conversation");
      return (await res.json()) as ConversationDetail;
    },
  });
}

export function useRenameConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const res = await fetch(`/api/chat/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error("Failed to rename conversation");
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: chatKeys.conversations() });
      qc.invalidateQueries({ queryKey: chatKeys.conversation(id) });
    },
  });
}

export function useArchiveConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const res = await fetch(`/api/chat/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      if (!res.ok) throw new Error("Failed to update conversation");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.conversations() });
    },
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/chat/conversations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete conversation");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.conversations() });
    },
  });
}
