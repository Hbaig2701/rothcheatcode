import { useQuery } from '@tanstack/react-query';
import { MultiStrategyResult } from '@/lib/calculations/types';

interface UseMultiStrategyOptions {
  clientId: string;
  enabled?: boolean;
}

interface MultiStrategyResponse {
  result: MultiStrategyResult;
  cached: boolean;
}

/**
 * Fetch or calculate multi-strategy projection for a client
 *
 * This hook calls an API endpoint that runs runMultiStrategySimulation
 * server-side and returns all 4 strategy results.
 */
export function useMultiStrategy({ clientId, enabled = true }: UseMultiStrategyOptions) {
  return useQuery<MultiStrategyResponse>({
    queryKey: ['multi-strategy', clientId],
    queryFn: async () => {
      const response = await fetch(`/api/clients/${clientId}/multi-strategy`);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to calculate multi-strategy projection');
      }

      return response.json();
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,   // 10 minutes (renamed from cacheTime in React Query v5)
  });
}
