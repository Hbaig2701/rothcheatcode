/**
 * Core-engine THEORY checks — does it match finance first principles, not just
 * itself.
 *
 * Run: npx tsx lib/calculations/__tests__/audit/growth-theory.test.ts
 *
 *   1. Compound growth (exact): a no-distribution IRA grows by round(bal×rate)
 *      each year — replicated to the cent.
 *   2. Compound growth (closed form): pre-RMD balance ≈ premium×(1+r)^n within
 *      0.1% — the "$250K @ 7% × 40yr = $3.7M, else the bug is in the inputs"
 *      sanity from the debugging protocol.
 *   3. Monotonicity: a higher conversion-bracket target ⇒ ≥ final Roth.
 *   4. Convert-low-save-high theorem: converting at a bracket BELOW the heir
 *      rate, with RMD friction, MUST raise net legacy vs doing nothing.
 */

import type { Client } from '../../../types/client';
import { makeClient, dispatch } from './factory';
import { Reporter } from './assertions';

const r = new Reporter();

const netLegacy = (y: { traditionalBalance: number; rothBalance: number; taxableBalance: number }, heirRate: number) =>
  Math.round(y.traditionalBalance * (1 - heirRate)) + y.rothBalance + Math.max(0, y.taxableBalance);

// ---------------------------------------------------------------------------
// (1)+(2) Compound growth. No SS, no income, no conversion, rates aligned so the
// IRA simply compounds until RMDs begin. Born 1960 (age 66 in 2026) → RMD 75.
// ---------------------------------------------------------------------------
for (const rate of [6, 7, 8]) {
  const premium = 25_000_000_0; // $2.5M to keep rounding noise tiny relative to balance
  const c: Client = makeClient({ age: 66, end_age: 95, qualified_account_value: premium, conversion_type: 'no_conversion', bonus_percent: 0, rate_of_return: rate, baseline_comparison_rate: rate, post_contract_rate: rate, ssi_annual_amount: 0, ssi_payout_age: 99, rmd_treatment: 'reinvested' });
  const { baseline } = dispatch(c, 2026);

  // Exact per-year replication.
  let bal = premium;
  for (let i = 0; i < baseline.length; i++) {
    const y = baseline[i];
    if (y.age >= 75) break; // RMDs start — clean compounding ends
    bal = bal + Math.round(bal * (rate / 100));
    r.ran();
    if (Math.abs(bal - y.traditionalBalance) > 4) {
      r.record({ fixture: `compound/${rate}%`, scenario: 'baseline', check: 'compound-exact', year: y.year, age: y.age, field: 'traditionalBalance', expected: bal, actual: y.traditionalBalance, delta: y.traditionalBalance - bal });
    }
    // Closed form within 0.1% (gross-error tripwire).
    const closed = premium * Math.pow(1 + rate / 100, i + 1);
    r.ran();
    if (Math.abs(closed - y.traditionalBalance) / closed > 0.001) {
      r.record({ fixture: `compound/${rate}%`, scenario: 'baseline', check: 'compound-closedform', year: y.year, age: y.age, expected: Math.round(closed), actual: y.traditionalBalance, delta: Math.round(y.traditionalBalance - closed), note: 'balance off >0.1% from premium×(1+r)^n' });
    }
  }
}

// ---------------------------------------------------------------------------
// (3) Monotonicity: higher target bracket ⇒ at least as much converted to Roth.
// ---------------------------------------------------------------------------
{
  let prevRoth = -1, prevRate = 0;
  for (const maxRate of [12, 22, 24, 32]) {
    const c = makeClient({ age: 64, end_age: 90, qualified_account_value: 200_000_000, conversion_type: 'optimized_amount', max_tax_rate: maxRate, tax_payment_source: 'from_taxable', taxable_accounts: 100_000_000, ssi_annual_amount: 2_000_000, bonus_percent: 0, post_contract_rate: 6, baseline_comparison_rate: 6, rate_of_return: 6 });
    const { formula } = dispatch(c, 2026);
    const finalRoth = formula[formula.length - 1].rothBalance;
    r.ran();
    if (prevRoth >= 0 && finalRoth < prevRoth - 100) {
      r.record({ fixture: `monotonic/${prevRate}->${maxRate}`, scenario: 'formula', check: 'roth-monotonic-in-bracket', field: 'finalRoth', expected: prevRoth, actual: finalRoth, delta: finalRoth - prevRoth, note: 'higher target bracket produced LESS final Roth' });
    }
    prevRoth = finalRoth; prevRate = maxRate;
  }
}

// ---------------------------------------------------------------------------
// (4) Convert-low-save-high theorem: convert at 22% when heirs would pay 40%,
// with RMD friction → strategy net legacy MUST beat baseline.
// ---------------------------------------------------------------------------
{
  const heirRate = 0.40;
  const c = makeClient({ age: 66, end_age: 92, qualified_account_value: 200_000_000, conversion_type: 'optimized_amount', max_tax_rate: 22, tax_payment_source: 'from_taxable', taxable_accounts: 60_000_000, heir_tax_rate: 40, ssi_annual_amount: 2_000_000, bonus_percent: 0, post_contract_rate: 6, baseline_comparison_rate: 6, rate_of_return: 6 });
  const { baseline, formula } = dispatch(c, 2026);
  const baseLeg = netLegacy(baseline[baseline.length - 1], heirRate);
  const stratLeg = netLegacy(formula[formula.length - 1], heirRate);
  r.ran();
  if (stratLeg < baseLeg) {
    r.record({ fixture: 'convert-low-save-high', scenario: 'formula', check: 'strategy-beats-baseline', expected: baseLeg, actual: stratLeg, delta: stratLeg - baseLeg, note: 'converting at 22% vs 40% heir rate should RAISE net legacy' });
  }
  console.log(`convert-low-save-high: baseline net legacy ${(baseLeg / 100).toLocaleString()}, strategy ${(stratLeg / 100).toLocaleString()} (Δ ${((stratLeg - baseLeg) / 100).toLocaleString()})`);
}

r.print('Core engine — theory (compound growth / monotonicity / Roth theorem)');
process.exit(r.breaches.length > 0 ? 1 : 0);
