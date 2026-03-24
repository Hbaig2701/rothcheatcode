"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SalesCall } from "@/lib/types/sales-call";

export const salesCallKeys = {
  all: ["sales-calls"] as const,
  lists: () => [...salesCallKeys.all, "list"] as const,
  details: () => [...salesCallKeys.all, "detail"] as const,
  detail: (id: string) => [...salesCallKeys.details(), id] as const,
};

export function useSalesCalls() {
  return useQuery({
    queryKey: salesCallKeys.lists(),
    queryFn: async (): Promise<{ calls: SalesCall[]; total: number }> => {
      const res = await fetch("/api/sales-calls");
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed to fetch calls" }));
        throw new Error(error.error || "Failed to fetch calls");
      }
      return res.json();
    },
  });
}

export function useSalesCall(id: string) {
  return useQuery({
    queryKey: salesCallKeys.detail(id),
    queryFn: async (): Promise<SalesCall> => {
      const res = await fetch(`/api/sales-calls/${id}`);
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed to fetch call" }));
        throw new Error(error.error || "Failed to fetch call");
      }
      return res.json();
    },
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && ["uploading", "transcribing", "analyzing"].includes(data.status)) {
        return 3000;
      }
      return false;
    },
  });
}

export function useCreateSalesCall() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (formData: FormData): Promise<SalesCall> => {
      const res = await fetch("/api/sales-calls", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(error.error || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: salesCallKeys.lists() });
    },
  });
}

export function useCreateSalesCallFromTranscript() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      title?: string;
      transcript_text: string;
      call_date?: string;
      notes?: string;
    }): Promise<SalesCall> => {
      const res = await fetch("/api/sales-calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed to create" }));
        throw new Error(error.error || "Failed to create");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: salesCallKeys.lists() });
    },
  });
}

export function useDeleteSalesCall() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/sales-calls/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: salesCallKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: salesCallKeys.lists() });
    },
  });
}

export function useReanalyzeSalesCall() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<SalesCall> => {
      const res = await fetch(`/api/sales-calls/${id}/reanalyze`, { method: "POST" });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed to reanalyze" }));
        throw new Error(error.error || "Failed to reanalyze");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(salesCallKeys.detail(data.id), data);
      queryClient.invalidateQueries({ queryKey: salesCallKeys.lists() });
    },
  });
}
