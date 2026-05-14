'use server';

/**
 * Training simulator — wraps the production calculation engine so theory
 * playgrounds can call it from client components via server actions.
 *
 * The same engine that runs real client projections runs the cast members
 * here. That guarantees the numbers in the training playgrounds are the
 * exact numbers an advisor would see if they made Bob (or Mary, or the
 * Joneses) a real client. No second engine, no risk of divergence.
 *
 * Inputs:
 *   - castId    — which fixture client to base the simulation on
 *   - overrides — sparse Partial<Client> to layer on top, supplied by the
 *                 module's playground sliders (e.g. {fixed_conversion_amount: 50_000_00})
 *
 * Output:
 *   - baseline  — yearly projection if the client does nothing (Traditional IRA + RMDs)
 *   - strategy  — yearly projection under the Roth conversion strategy
 *   - summary   — distributions / IRMAA / heirs / wealth roll-up (same shape
 *                 production uses on the dashboard summary cards)
 */

import { runSimulation, runSimulationWithMetrics, createSimulationInput } from '@/lib/calculations/engine';
import { CAST, type CastId } from './cast';
import type { Client } from '@/lib/types/client';
import type { YearlyResult } from '@/lib/calculations/types';
import type { SummaryMetrics } from '@/lib/calculations/engine';

export type TrainingSimResult = {
  baseline: YearlyResult[];
  strategy: YearlyResult[];
  summary: SummaryMetrics;
};

export async function simulate(
  castId: CastId,
  overrides: Partial<Client> = {},
): Promise<TrainingSimResult> {
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
 * Synchronous variant for use inside server components (e.g. the module
 * page rendering the initial chart server-side before the playground takes
 * over). Identical math to `simulate` — just no 'use server' wrapping
 * since server components can call calc code directly.
 */
export function simulateSync(
  castId: CastId,
  overrides: Partial<Client> = {},
): TrainingSimResult {
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

// Re-export so server components that don't need the action wrapper can use
// runSimulation directly via this module.
export { runSimulation };
