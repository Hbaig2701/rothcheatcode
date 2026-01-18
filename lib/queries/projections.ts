"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProjectionResponse } from "@/lib/types/projection";

/**
 * Query key factory for projections
 * Following established pattern from clients.ts
 */
export const projectionKeys = {
  all: ["projections"] as const,
  client: (clientId: string) => [...projectionKeys.all, clientId] as const,
};

/**
 * Fetch projection for a client (uses cached if data unchanged)
 */
async function fetchProjection(clientId: string): Promise<ProjectionResponse> {
  const response = await fetch(`/api/clients/${clientId}/projections`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch projection");
  }

  return response.json();
}

/**
 * Force recalculate projection (ignores cache)
 */
async function recalculateProjection(
  clientId: string
): Promise<ProjectionResponse> {
  const response = await fetch(`/api/clients/${clientId}/projections`, {
    method: "POST",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to recalculate projection");
  }

  return response.json();
}

/**
 * Hook to fetch projection for a client
 * Returns cached projection if client data unchanged, otherwise runs new simulation
 *
 * @param clientId - UUID of the client
 * @param options - Additional query options (enabled, etc.)
 */
export function useProjection(
  clientId: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: projectionKeys.client(clientId),
    queryFn: () => fetchProjection(clientId),
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60 * 1000, // 5 minutes - projection data is computed, changes rarely
  });
}

/**
 * Hook to force recalculate a projection
 * Use when user explicitly wants fresh calculation (e.g., after editing client)
 */
export function useRecalculateProjection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: recalculateProjection,
    onSuccess: (data, clientId) => {
      // Update the cache with new projection
      queryClient.setQueryData(projectionKeys.client(clientId), data);
    },
  });
}
