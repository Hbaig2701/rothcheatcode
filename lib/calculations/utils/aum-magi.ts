import type { Client } from '@/lib/types/client';
import { createSimulationInput } from '@/lib/calculations/engine';
import { runAumScenario } from '@/lib/calculations/scenarios/aum';

/**
 * AUM split: make the Roth-side engine aware of the AUM bucket's IRA pulls.
 *
 * With `aum_allocation_percent > 0` the route runs two engines: the Roth side
 * on the reduced slice, and the AUM side (`runAumScenario`) which liquidates
 * its slice over `aum_withdrawal_years` as taxable IRA distributions. Those
 * pulls are real MAGI, but the Roth side never saw them — so its IRMAA cap
 * sized conversions as if they didn't exist and its 2-year lookback never
 * charged the surcharge. The report then showed MAGI over the selected tier
 * with "tier 0" (Joshua Williamson / Tammy Eck, ticket 58eb5e9d).
 *
 * The pull schedule is deterministic (pendingIra / yearsRemaining; the
 * spending-shortfall path only touches the brokerage bucket), so it can be
 * computed up front with no shortfall and attached to the Roth-side client as
 * `external_magi_income_by_year`. The engines add it to the IRMAA headroom
 * MAGI and to the lookback history. The AUM engine still taxes the pull on
 * its own slice exactly as before — bracket stacking across the two engines
 * remains a known limitation — so cash flows are unchanged.
 *
 * Strategy side only: the do-nothing baseline has no AUM pulls.
 */
export function withAumPullMagi(rothSideClient: Client, strategyClient: Client): Client {
  const pct = strategyClient.aum_allocation_percent ?? 0;
  if (pct <= 0) return rothSideClient;
  const startingIraPortion = Math.round((strategyClient.qualified_account_value ?? 0) * (pct / 100));
  if (startingIraPortion <= 0) return rothSideClient;

  const { startYear, endYear } = createSimulationInput(strategyClient, null);
  const projectionYears = endYear - startYear + 1;
  const aumYears = runAumScenario({
    startingIraPortion,
    client: strategyClient,
    startYear,
    projectionYears,
    iraShortfallByYear: new Map(),
  });

  const byYear: Record<number, number> = {};
  for (const y of aumYears) {
    const pull = y.iraWithdrawal ?? 0;
    if (pull > 0) byYear[y.year] = pull;
  }
  if (Object.keys(byYear).length === 0) return rothSideClient;
  return { ...rothSideClient, external_magi_income_by_year: byYear };
}
