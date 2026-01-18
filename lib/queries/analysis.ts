"use client";

import { useQuery } from '@tanstack/react-query';
import type { BreakEvenAnalysis, SensitivityResult, WidowAnalysisResult } from '@/lib/calculations/analysis/types';

interface AnalysisResponse {
  breakeven: BreakEvenAnalysis | null;
  sensitivity: SensitivityResult | null;
  widow: WidowAnalysisResult | null;
}

/**
 * Query keys for analysis data
 */
export const analysisKeys = {
  all: ['analysis'] as const,
  client: (clientId: string) => [...analysisKeys.all, clientId] as const,
};

/**
 * Fetch analysis data for a client
 */
async function fetchAnalysis(clientId: string): Promise<AnalysisResponse> {
  const response = await fetch(`/api/clients/${clientId}/analysis`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch analysis');
  }

  return response.json();
}

/**
 * Hook to fetch advanced analysis data
 * Includes breakeven, sensitivity, and widow analysis
 */
export function useAnalysis(clientId: string | undefined) {
  return useQuery({
    queryKey: analysisKeys.client(clientId ?? ''),
    queryFn: () => fetchAnalysis(clientId!),
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000, // 5 minutes (analysis is expensive)
  });
}
