"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Client, ClientUpdate } from "@/lib/types/client";
import type { ClientCreateInput, ClientFullFormData, ClientFormData } from "@/lib/validations/client";

// Query key factory - provides consistent keys for caching
export const clientKeys = {
  all: ["clients"] as const,
  lists: () => [...clientKeys.all, "list"] as const,
  list: (filters?: string) => [...clientKeys.lists(), filters] as const,
  details: () => [...clientKeys.all, "detail"] as const,
  detail: (id: string) => [...clientKeys.details(), id] as const,
  scenarios: (id: string) => [...clientKeys.detail(id), "scenarios"] as const,
};

// Fetch all clients for the current user
export function useClients() {
  return useQuery({
    queryKey: clientKeys.lists(),
    queryFn: async (): Promise<Client[]> => {
      const res = await fetch("/api/clients");
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed to fetch clients" }));
        throw new Error(error.error || "Failed to fetch clients");
      }
      return res.json();
    },
  });
}

// Fetch a single client by ID
export function useClient(id: string) {
  return useQuery({
    queryKey: clientKeys.detail(id),
    queryFn: async (): Promise<Client> => {
      const res = await fetch(`/api/clients/${id}`);
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed to fetch client" }));
        throw new Error(error.error || "Failed to fetch client");
      }
      return res.json();
    },
    enabled: !!id, // Only run query if id is provided
  });
}

// Fetch a single client and all its scenarios
export function useClientScenarios(id: string) {
  return useQuery({
    queryKey: clientKeys.scenarios(id),
    queryFn: async (): Promise<Client[]> => {
      const res = await fetch(`/api/clients/${id}/scenarios`);
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed to fetch scenarios" }));
        throw new Error(error.error || "Failed to fetch scenarios");
      }
      return res.json();
    },
    enabled: !!id,
  });
}

// Create a new client (supports both simple 4-field form and full 28-field form)
export function useCreateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ClientCreateInput | ClientFullFormData | ClientFormData): Promise<Client> => {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed to create client" }));
        throw new Error(error.error || "Failed to create client");
      }
      return res.json();
    },
    onSuccess: () => {
      // Invalidate the clients list to trigger refetch
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
    },
  });
}

// Duplicate a client (create a new scenario based on it)
export function useDuplicateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<Client> => {
      const res = await fetch(`/api/clients/${id}/duplicate`, {
        method: "POST",
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed to duplicate client" }));
        throw new Error(error.error || "Failed to duplicate client");
      }
      return res.json();
    },
    onSuccess: (data, originalId) => {
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
      queryClient.invalidateQueries({ queryKey: clientKeys.scenarios(originalId) });
      queryClient.invalidateQueries({ queryKey: clientKeys.scenarios(data.id) });
    },
  });
}

// Update an existing client
export function useUpdateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ClientUpdate }): Promise<Client> => {
      const res = await fetch(`/api/clients/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed to update client" }));
        throw new Error(error.error || "Failed to update client");
      }
      return res.json();
    },
    onSuccess: (data, variables) => {
      // Invalidate everything under ["clients"] so any scenarios list
      // that contains this client also refreshes (e.g., the parent's
      // scenarios list on the client detail page).
      queryClient.invalidateQueries({ queryKey: clientKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "clients" &&
          query.queryKey[query.queryKey.length - 1] === "scenarios",
      });
    },
  });
}

// Delete a client
export function useDeleteClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/clients/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed to delete client" }));
        throw new Error(error.error || "Failed to delete client");
      }
      // DELETE returns 204 No Content, don't try to parse JSON
    },
    onSuccess: (_, id) => {
      // Remove the deleted client from cache
      queryClient.removeQueries({ queryKey: clientKeys.detail(id) });
      // Invalidate the list to trigger refetch
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
      // Invalidate any scenarios list that might contain this client so the
      // parent's scenarios list refreshes after a child scenario is deleted.
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "clients" &&
          query.queryKey[query.queryKey.length - 1] === "scenarios" &&
          // Skip the deleted client's own scenarios query — it would 404 since
          // the row is gone, and the page is navigating away anyway.
          query.queryKey[2] !== id,
      });
    },
  });
}
