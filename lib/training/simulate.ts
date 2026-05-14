/**
 * Training simulator - wraps the production calculation engine so theory
 * playgrounds can call it from client components via server actions.
 *
 * The same engine that runs real client projections runs the cast members
 * here. That guarantees the numbers in the training playgrounds are the
 * exact numbers an advisor would see if they made Bob (or Mary, or the
 * Joneses) a real client. No second engine, no risk of divergence.
 *
 * This file (no 'use server') exports the synchronous variant for server
 * components rendering initial state, plus the shared types.
 *
 * The async server action lives in `simulate-action.ts` (file-level
 * 'use server'). Client components import that one. Splitting them is
 * required because Next.js disallows inline 'use server' in any module
 * a Client Component imports from - and module body components import
 * the sync variant from this file.
 */

import { runSimulationWithMetrics, createSimulationInput } from '@/lib/calculations/engine';
import { CAST, type CastId } from './cast';
import type { Client } from '@/lib/types/client';
import type { YearlyResult } from '@/lib/calculations/types';
import type { SummaryMetrics } from '@/lib/calculations/engine';

export type TrainingSimResult = {
  baseline: YearlyResult[];
  strategy: YearlyResult[];
  summary: SummaryMetrics;
};

/**
 * Internal helper - shared between the sync and async paths so both
 * surfaces produce identical results.
 */
export function runOnce(castId: CastId, overrides: Partial<Client>): TrainingSimResult {
  const base = CAST[castId];
  const client: Client = { ...base, ...overrides };

  const input = createSimulationInput(client);
  const { result, metrics } = runSimulationWithMetrics(input);

  return {
    baseline: result.baseline,
    strategy: result.formula,
    summary: metrics,
  };
}

/**
 * Sync variant for server components rendering the playground's initial
 * state on first paint. Identical math to the `simulate` server action.
 */
export function simulateSync(
  castId: CastId,
  overrides: Partial<Client> = {},
): TrainingSimResult {
  return runOnce(castId, overrides);
}
