/**
 * Phase 4 — Edge & boundary matrix.
 *
 * Run: npx tsx lib/calculations/__tests__/audit/edge-matrix.test.ts
 *
 * Targets the discontinuities where off-by-one and threshold bugs live:
 * RMD start-age cohorts (73 vs 75), the 59½ penalty boundary, IRMAA tier
 * cliffs, surrender-charge boundaries, and GI phase ordering.
 */

import type { Client } from '../../../types/client';
import { makeClient, dispatch } from './factory';
import { Reporter } from './assertions';

const r = new Reporter();

// ---------------------------------------------------------------------------
// RMD start age: birth ≤1959 → 73, birth 1960+ → 75 (SECURE 2.0). With
// date_of_birth null the engine derives birthYear = startYear − age.
// ---------------------------------------------------------------------------
function firstRmdAge(client: Client): number | null {
  const { baseline } = dispatch(client, 2026);
  const hit = baseline.find((y) => (y.rmdAmount ?? 0) > 0);
  return hit ? hit.age : null;
}
// startYear 2026: age 67 → born 1959 → RMD 73; age 66 → born 1960 → RMD 75.
for (const [age, expected, label] of [[67, 73, 'born1959→73'], [66, 75, 'born1960→75']] as const) {
  r.ran();
  const got = firstRmdAge(makeClient({ age, end_age: 95, conversion_type: 'no_conversion', qualified_account_value: 80_000_000 }));
  if (got !== expected) {
    r.record({ fixture: `rmd-age/${label}`, scenario: 'baseline', check: 'rmd-start-age', age: got ?? undefined, expected, actual: got ?? undefined, note: `first RMD at age ${got}, expected ${expected}` });
  }
}

// No RMD the year before start age, RMD present at start age (single fixture).
{
  const { baseline } = dispatch(makeClient({ age: 67, end_age: 95, conversion_type: 'no_conversion', qualified_account_value: 80_000_000 }), 2026);
  const at72 = baseline.find((y) => y.age === 72);
  const at73 = baseline.find((y) => y.age === 73);
  r.ran();
  if (at72 && (at72.rmdAmount ?? 0) > 0) r.record({ fixture: 'rmd-boundary', scenario: 'baseline', check: 'no-rmd-before-start', age: 72, actual: at72.rmdAmount, note: 'RMD before start age 73' });
  r.ran();
  if (at73 && (at73.rmdAmount ?? 0) <= 0) r.record({ fixture: 'rmd-boundary', scenario: 'baseline', check: 'rmd-at-start', age: 73, note: 'no RMD at start age 73' });
}

// ---------------------------------------------------------------------------
// 59½ early-withdrawal penalty: a client UNDER 59½ paying conversion tax from
// the IRA must incur a 10% penalty on the IRA-funded tax; at/after 59½, none.
// ---------------------------------------------------------------------------
{
  const young = makeClient({ age: 55, end_age: 75, conversion_type: 'fixed_amount', fixed_conversion_amount: 4_000_000, tax_payment_source: 'from_ira', qualified_account_value: 60_000_000, ssi_payout_age: 67 });
  const { formula } = dispatch(young, 2026);
  for (const y of formula) {
    const penalty = y.earlyWithdrawalPenalty ?? 0;
    const taxFromIra = y.taxesPaidFromIRA ?? 0;
    if (y.age < 59 && taxFromIra > 0) {
      r.ran();
      if (penalty <= 0) r.record({ fixture: 'penalty-59.5', scenario: 'formula', check: 'penalty-applies-under-59.5', year: y.year, age: y.age, note: 'IRA-funded tax under 59½ with no 10% penalty' });
    }
    if (y.age >= 60) {
      r.ran();
      if (penalty > 0) r.record({ fixture: 'penalty-59.5', scenario: 'formula', check: 'no-penalty-after-59.5', year: y.year, age: y.age, field: 'earlyWithdrawalPenalty', actual: penalty, note: 'penalty after 59½' });
    }
  }
}

// ---------------------------------------------------------------------------
// IRMAA tier ⇔ surcharge consistency (cliff integrity): tier 0 must mean $0
// surcharge; any positive tier must mean a positive surcharge, and vice versa.
// ---------------------------------------------------------------------------
{
  // High-income MFJ to push through IRMAA tiers post-65.
  const hi = makeClient({ filing_status: 'married_filing_jointly', spouse_age: 64, age: 65, end_age: 95, qualified_account_value: 400_000_000, conversion_type: 'optimized_amount', max_tax_rate: 35, ssi_annual_amount: 5_000_000, spouse_ssi_annual_amount: 4_000_000 });
  for (const [scenario, years] of Object.entries(dispatch(hi, 2026)).filter(([k]) => k === 'baseline' || k === 'formula') as ['baseline' | 'formula', any[]][]) {
    for (const y of years) {
      const tier = y.irmaaTier;
      const sur = y.irmaaSurcharge ?? 0;
      if (tier == null) continue;
      r.ran();
      if ((tier === 0 && sur > 0) || (tier > 0 && sur <= 0)) {
        r.record({ fixture: 'irmaa-cliff', scenario, check: 'irmaa-tier-surcharge-consistency', year: y.year, age: y.age, field: 'irmaaTier', actual: tier, note: `tier=${tier} but surcharge=${(sur / 100).toFixed(0)}` });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Surrender boundary: during the surrender period surrenderValue ≤ accountValue
// (a charge applies); after it, surrenderValue == the account value (no charge).
// ---------------------------------------------------------------------------
{
  const growth = makeClient({ blueprint_type: 'high-bonus-long-term-growth', bonus_percent: 22, surrender_years: 15, conversion_type: 'no_conversion', age: 60, end_age: 95 });
  const { formula } = dispatch(growth, 2026);
  formula.forEach((y, i) => {
    if (y.surrenderValue == null) return;
    const charge = y.surrenderChargePercent ?? 0;
    r.ran();
    if (charge > 0 && y.surrenderValue > y.traditionalBalance + 100) {
      r.record({ fixture: 'surrender', scenario: 'formula', check: 'surrender-value-le-account', year: y.year, age: y.age, expected: y.traditionalBalance, actual: y.surrenderValue, note: 'surrender value exceeds account value while a charge applies' });
    }
    // After the surrender window (year index >= surrender_years) charge must be 0.
    if (i >= 15) {
      r.ran();
      if (charge > 0) r.record({ fixture: 'surrender', scenario: 'formula', check: 'no-charge-after-window', year: y.year, age: y.age, field: 'surrenderChargePercent', actual: charge, note: 'surrender charge after the surrender window' });
    }
  });
}

// ---------------------------------------------------------------------------
// GI phase ordering: phases must progress conversion → purchase → deferral →
// income (never regress), and income must begin no earlier than income_start_age.
// ---------------------------------------------------------------------------
{
  const ORDER: Record<string, number> = { waiting: 0, conversion: 1, purchase: 2, deferral: 3, income: 4 };
  const gi = makeClient({ blueprint_type: 'generic-income', income_start_age: 74, gi_conversion_years: 5, age: 62, end_age: 95 });
  const { formula } = dispatch(gi, 2026);
  let prev = -1, firstIncomeAge: number | null = null;
  for (const y of formula) {
    const ph = y.giPhase;
    if (ph == null) continue;
    const rank = ORDER[ph] ?? -1;
    r.ran();
    if (rank < prev) r.record({ fixture: 'gi-phase', scenario: 'formula', check: 'gi-phase-monotonic', year: y.year, age: y.age, note: `phase regressed to ${ph}` });
    prev = Math.max(prev, rank);
    if (ph === 'income' && firstIncomeAge == null) firstIncomeAge = y.age;
  }
  r.ran();
  if (firstIncomeAge != null && firstIncomeAge < 74) {
    r.record({ fixture: 'gi-phase', scenario: 'formula', check: 'gi-income-start', age: firstIncomeAge, expected: 74, actual: firstIncomeAge, note: 'GI income started before income_start_age' });
  }
}

r.print('Phase 4 — Edge & boundary matrix');
process.exit(r.breaches.length > 0 ? 1 : 0);
