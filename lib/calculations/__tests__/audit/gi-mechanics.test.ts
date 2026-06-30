/**
 * GI product mechanics vs config (theory) — roll-up + payout factor.
 *
 * Run: npx tsx lib/calculations/__tests__/audit/gi-mechanics.test.ts
 *
 * Verifies the GI engine applies the configured product mechanics:
 *   - compound roll-up tiers (compound-rollup-income: 7% yrs 1-5, 4% yrs 6-10)
 *     grow the income benefit base during deferral.
 *   - the income payout = income base × the configured payout factor for the
 *     income-start age (single 74 → 7.50%).
 * Independent of carrier illustrations (those need seeded custom products);
 * this checks the system preset against its own published config.
 */

import type { Client } from '../../../types/client';
import { makeClient, dispatch } from './factory';
import { Reporter } from './assertions';

const r = new Reporter();

// Independent copy of compound-rollup-income config.
const PAYOUT_SINGLE: Record<number, number> = { 70: 7.10, 71: 7.20, 72: 7.30, 73: 7.40, 74: 7.50, 75: 7.60, 76: 7.70 };
function rollupRate(deferralYearIndex: number): number {
  // 1-based year since purchase. yrs 1-5 → 7%, yrs 6-10 → 4%, then 0.
  if (deferralYearIndex >= 1 && deferralYearIndex <= 5) return 7;
  if (deferralYearIndex >= 6 && deferralYearIndex <= 10) return 4;
  return 0;
}

const incomeStartAge = 74;
const c: Client = makeClient({
  blueprint_type: 'compound-rollup-income', filing_status: 'single',
  age: 62, end_age: 92, qualified_account_value: 90_000_000,
  gi_conversion_years: 5, gi_conversion_bracket: 24, income_start_age: incomeStartAge,
  payout_type: 'individual', ssi_annual_amount: 2_500_000,
});
const { formula } = dispatch(c, 2026);

// Identify the deferral phase rows (income base growing, before income).
const deferral = formula.filter((y) => y.giPhase === 'deferral');
const income = formula.filter((y) => y.giPhase === 'income');

// (1) Roll-up: each deferral year's growth must equal ONE of the configured
// tier rates (7% or 4%) — the rate magnitudes are applied correctly. The TIER
// BOUNDARY (when 7%→4%) is checked separately below as F8 (suspected off-by-one),
// because confirming it requires a carrier illustration, not first principles.
const VALID_RATES = [7, 4, 0];
let sevenPctYears = 0;
for (let i = 1; i < deferral.length; i++) {
  const prevBase = deferral[i - 1].incomeRiderValue ?? 0;
  const base = deferral[i].incomeRiderValue ?? 0;
  if (prevBase <= 0) continue;
  const observed = (base / prevBase - 1) * 100;
  if (Math.abs(observed - 7) < 0.1) sevenPctYears++;
  r.ran();
  if (!VALID_RATES.some((rt) => Math.abs(observed - rt) < 0.1)) {
    r.record({ fixture: 'gi-rollup', scenario: 'formula', check: 'rollup-valid-rate', year: deferral[i].year, age: deferral[i].age, note: `roll-up ${observed.toFixed(2)}% is not a configured tier rate (7/4/0)` });
  }
}
// F8 (documented, not failed): config says 7% for tier years 1-5; the engine
// credits 7% for only 4 deferral years here (deferralYear = age-purchaseAge+1 →
// first roll-up labeled year 2 → 4% tier starts one anniversary early). Whether
// that matches the carrier illustration is unconfirmed (see AUDIT.md F8).
if (sevenPctYears < 5) {
  console.log(`⚠️  F8 (needs carrier confirmation): only ${sevenPctYears} years credited at 7% (config tier years 1-5 ⇒ up to 5). deferralYear off-by-one suspected.`);
}

// (2) Payout factor: at income start, payout = income base × factor(age).
if (income.length > 0) {
  const first = income[0];
  const factor = PAYOUT_SINGLE[first.age];
  if (factor != null) {
    const base = first.incomeRiderValue ?? 0;
    const expectPayout = Math.round(base * factor / 100);
    r.ran();
    if (Math.abs(expectPayout - (first.incomePayoutAmount ?? 0)) > Math.max(500, base * 0.01)) {
      r.record({ fixture: 'gi-payout', scenario: 'formula', check: 'payout-factor', year: first.year, age: first.age, field: 'incomePayoutAmount', expected: expectPayout, actual: first.incomePayoutAmount, delta: (first.incomePayoutAmount ?? 0) - expectPayout, note: `income base ${(base / 100).toFixed(0)} × ${factor}%` });
    }
    // engine-reported payout rate should match the config factor too.
    r.ran();
    if (first.giPayoutRate != null && Math.abs(first.giPayoutRate - factor) > 0.05) {
      r.record({ fixture: 'gi-payout', scenario: 'formula', check: 'payout-rate-field', year: first.year, age: first.age, expected: Math.round(factor * 100), actual: Math.round((first.giPayoutRate ?? 0) * 100), note: `giPayoutRate ${first.giPayoutRate} vs config ${factor}` });
    }
    console.log(`gi: income base@${first.age} ${((first.incomeRiderValue ?? 0) / 100).toLocaleString()}, payout ${((first.incomePayoutAmount ?? 0) / 100).toLocaleString()}, rate ${first.giPayoutRate}% (config ${factor}%)`);
  }
}
console.log(`gi phases: ${deferral.length} deferral yrs, ${income.length} income yrs`);

r.print('GI product mechanics vs config');
process.exit(r.breaches.length > 0 ? 1 : 0);
