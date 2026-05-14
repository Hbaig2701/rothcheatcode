/**
 * Training simulator — wraps the production calculation engine so theory
 * playgrounds can call it from client components via server actions.
 *
 * The same engine that runs real client projections runs the cast members
 * here. That guarantees the numbers in the training playgrounds are the
 * exact numbers an advisor would see if they made Bob (or Mary, or the
 * Joneses) a real client. No second engine, no risk of divergence.
 *
 * Two surfaces:
 *   - `simulate`     — server action (per-function 'use server'). Callable
 *                      from client components like the playgrounds.
 *   - `simulateSync` — plain server-side function for server components
 *                      that need to render initial state on first paint.
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

function runOnce(castId: CastId, overrides: Partial<Client>): TrainingSimResult {
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
 * Server Action — callable from client components (the playgrounds).
 * Per-function 'use server' so the rest of this file's exports stay
 * usable by server components without being wrapped as actions.
 */
export async function simulate(
  castId: CastId,
  overrides: Partial<Client> = {},
): Promise<TrainingSimResult> {
  'use server';
  return runOnce(castId, overrides);
}

/**
 * Sync variant for server components rendering the playground's initial
 * state on first paint. Identical math to `simulate` — just no action
 * wrapper since server components can call calc code directly.
 */
export function simulateSync(
  castId: CastId,
  overrides: Partial<Client> = {},
): TrainingSimResult {
  return runOnce(castId, overrides);
}
