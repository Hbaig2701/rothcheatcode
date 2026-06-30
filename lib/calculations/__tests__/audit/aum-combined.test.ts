/**
 * AUM combined overlay — split → run → recombine integrity.
 *
 * Run: npx tsx lib/calculations/__tests__/audit/aum-combined.test.ts
 *
 * Replicates the projections route's overlay: reduce the IRA to the Roth slice,
 * run the Roth engine, run the AUM bucket on the other slice, sum them. Checks:
 *   - split integrity: at issue, Roth-side IRA + AUM pending-IRA == full premium
 *     (no slice lost or double-counted).
 *   - combined conservation + non-negativity on the summed row.
 *   - shortfall absorption (ticket 34b54286): with 100% AUM and scheduled IRA
 *     withdrawals, the brokerage must absorb the spending the (now $0) Roth-side
 *     IRA can't — total satisfied ≈ requested, not silently clipped to $0.
 */

import type { Client } from '../../../types/client';
import type { YearlyResult } from '../../types';
import { makeClient, dispatch } from './factory';
import { runAumScenario } from '../../scenarios/aum';
import { Reporter } from './assertions';

const r = new Reporter();
const TOL = 300;

function requestedIraForYear(client: Client, year: number): number {
  return (client.withdrawals ?? [])
    .filter((w) => w.year === year && (w.source === 'ira' || w.source === 'auto'))
    .reduce((s, w) => s + (w.amount ?? 0), 0);
}

function overlay(client: Client) {
  const pct = client.aum_allocation_percent ?? 0;
  const rothSide: Client = { ...client, qualified_account_value: Math.round((client.qualified_account_value ?? 0) * (1 - pct / 100)) };
  const { formula: roth } = dispatch(rothSide, 2026);
  const startingIraPortion = Math.round((client.qualified_account_value ?? 0) * (pct / 100));
  const iraShortfallByYear = new Map<number, number>();
  for (const ry of roth) {
    const requested = requestedIraForYear(client, ry.year);
    if (requested <= 0) continue;
    const satisfied = (ry.iraWithdrawal ?? 0) + (ry.rothWithdrawal ?? 0);
    const short = Math.max(0, requested - satisfied);
    if (short > 0) iraShortfallByYear.set(ry.year, short);
  }
  const aum = runAumScenario({ startingIraPortion, client, startYear: 2026, projectionYears: roth.length, iraShortfallByYear });
  return { roth, aum, startingIraPortion };
}

// ---- (1) split integrity + conservation, no scheduled withdrawals ----
{
  const client = makeClient({ age: 64, end_age: 90, qualified_account_value: 200_000_000, aum_allocation_percent: 40, conversion_type: 'optimized_amount', max_tax_rate: 24, tax_payment_source: 'from_taxable', taxable_accounts: 50_000_000, ssi_annual_amount: 2_000_000, bonus_percent: 0, post_contract_rate: 6, baseline_comparison_rate: 6, rate_of_return: 6 });
  const { roth, aum } = overlay(client);
  // issue-year split: roth IRA + aum pending-IRA ≈ premium (before year-1 flows
  // it's exact; after one year both have grown/converted, so compare BOY).
  const rothBOY = roth[0].traditionalBOY ?? 0;
  const aumBOY = aum[0].traditionalBOY ?? 0; // pending-IRA BOY
  r.ran();
  if (Math.abs(rothBOY + aumBOY - (client.qualified_account_value ?? 0)) > TOL) {
    r.record({ fixture: 'aum-combined/split', scenario: 'formula', check: 'split-integrity', expected: client.qualified_account_value ?? 0, actual: rothBOY + aumBOY, delta: rothBOY + aumBOY - (client.qualified_account_value ?? 0), note: 'roth-side IRA + AUM pending-IRA != premium at issue' });
  }
  // combined non-negativity + netWorth identity
  for (let i = 0; i < Math.min(roth.length, aum.length); i++) {
    const cTrad = roth[i].traditionalBalance + aum[i].traditionalBalance;
    const cRoth = roth[i].rothBalance + aum[i].rothBalance;
    const cTax = roth[i].taxableBalance + aum[i].taxableBalance;
    const cNW = roth[i].netWorth + aum[i].netWorth;
    r.ran();
    if (cTrad < -TOL || cRoth < -TOL || cTax < -TOL) r.record({ fixture: 'aum-combined/split', scenario: 'formula', check: 'combined-nonneg', year: roth[i].year, age: roth[i].age, note: `trad ${cTrad} roth ${cRoth} tax ${cTax}` });
    r.ran();
    if (Math.abs(cNW - (cTrad + cRoth + cTax)) > TOL) r.record({ fixture: 'aum-combined/split', scenario: 'formula', check: 'combined-networth', year: roth[i].year, age: roth[i].age, expected: cTrad + cRoth + cTax, actual: cNW, delta: cNW - (cTrad + cRoth + cTax) });
  }
}

// ---- (2) shortfall absorption: 100% AUM + scheduled IRA withdrawals ----
{
  const W = 12_000_000; // $120k/yr
  const withdrawals = Array.from({ length: 10 }, (_, i) => ({ age: 70 + i, year: 2032 + i, amount: W, source: 'ira' as const }));
  const client = makeClient({ age: 64, end_age: 90, qualified_account_value: 200_000_000, aum_allocation_percent: 100, conversion_type: 'no_conversion', tax_payment_source: 'from_taxable', taxable_accounts: 0, withdrawals, ssi_annual_amount: 2_000_000, bonus_percent: 0, post_contract_rate: 6, baseline_comparison_rate: 6, rate_of_return: 6 });
  const { roth, aum } = overlay(client);
  let requestedTotal = 0, absorbedTotal = 0, rothSatisfied = 0;
  for (let i = 0; i < aum.length; i++) {
    const req = requestedIraForYear(client, aum[i].year);
    requestedTotal += req;
    absorbedTotal += aum[i].aumScheduledWithdrawal ?? 0;
    rothSatisfied += (roth[i].iraWithdrawal ?? 0) + (roth[i].rothWithdrawal ?? 0);
  }
  // With 100% AUM the Roth-side IRA is $0, so the brokerage must absorb the
  // spending. Total satisfied (roth + AUM) must be ~= requested (≥ 90%) — the
  // ticket-34b54286 regression was that it silently clipped to far less. Allow
  // a shortfall only if the brokerage genuinely ran dry (it doesn't here).
  const satisfied = rothSatisfied + absorbedTotal;
  r.ran();
  if (satisfied < requestedTotal * 0.9) {
    r.record({ fixture: 'aum-combined/shortfall', scenario: 'formula', check: 'shortfall-absorbed', expected: requestedTotal, actual: satisfied, delta: satisfied - requestedTotal, note: 'scheduled IRA spending not absorbed by AUM (silent clip — ticket 34b54286)' });
  }
  console.log(`shortfall: requested ${(requestedTotal / 100).toLocaleString()}, AUM-absorbed ${(absorbedTotal / 100).toLocaleString()}, total satisfied ${(satisfied / 100).toLocaleString()}`);
}

r.print('AUM combined overlay — split/recombine integrity');
process.exit(r.breaches.length > 0 ? 1 : 0);
