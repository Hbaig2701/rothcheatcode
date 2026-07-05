/**
 * Phase 7 — Golden masters for the GROWTH and GI engines (production dispatch).
 *
 * Run: npx tsx lib/calculations/__tests__/audit/golden-masters.test.ts
 *
 * report-fixtures.test.ts locks the STANDARD engine (runSimulation). But
 * production routes `fia`/growth products through runGrowthSimulation and GI
 * products through runGuaranteedIncomeSimulation (audit F3). This test locks
 * headline numbers from those PRODUCTION engines (via dispatch) so growth/GI
 * drift fails loudly. Values were captured 2026-06-29 and are certified by the
 * invariant + recompute suites (the engine output is internally consistent and
 * its tax math matches an independent recompute). To intentionally update:
 * run, copy the printed actuals, and note the cause.
 */

import type { Client } from '../../../types/client';
import { makeClient, dispatch } from './factory';

let passed = 0, failed = 0;
const fails: string[] = [];
function eq(actual: number, expected: number, msg: string) {
  if (actual === expected) { passed++; return; }
  failed++;
  fails.push(`  FAIL ${msg}: expected ${expected} (${(expected / 100).toFixed(2)})  actual ${actual} (${(actual / 100).toFixed(2)})  Δ${actual - expected}`);
}

function summarize(client: Client) {
  const { baseline, formula } = dispatch(client, 2026);
  const bF = baseline[baseline.length - 1];
  const fF = formula[formula.length - 1];
  return {
    baseFinalNetWorth: bF.netWorth,
    baseFinalTraditional: bF.traditionalBalance,
    formulaFinalNetWorth: fF.netWorth,
    formulaFinalRoth: fF.rothBalance,
    totalConversions: formula.reduce((s, y) => s + (y.conversionAmount ?? 0), 0),
    totalTax: formula.reduce((s, y) => s + y.totalTax, 0),
    totalRiderFee: formula.reduce((s, y) => s + (y.riderFee ?? 0), 0),
  };
}

// ---- GROWTH master: high-bonus long-term FIA, MFJ, optimized conversions ----
const growth = summarize(makeClient({
  blueprint_type: 'high-bonus-long-term-growth', bonus_percent: 22, surrender_years: 15,
  filing_status: 'married_filing_jointly', spouse_age: 61, age: 63, end_age: 92, state: 'CA',
  qualified_account_value: 120_000_000, conversion_type: 'optimized_amount', max_tax_rate: 24,
  ssi_annual_amount: 3_600_000, spouse_ssi_payout_age: 67, spouse_ssi_annual_amount: 3_000_000,
}));

const GROWTH_EXPECTED = {
  baseFinalNetWorth: 556_631_517,
  baseFinalTraditional: 229_665_771,
  formulaFinalNetWorth: 574_946_268,
  formulaFinalRoth: 574_946_268,
  totalConversions: 114_310_724,
  // totalTax re-locked v71 (2026-07-05): IRMAA 2026 brackets corrected to actual
  // CMS figures (Lori Avant ticket). Higher surcharges add ~$4.4K lifetime IRMAA
  // to this MFJ/CA strategy (44,134,750 → 44,576,110); net worth unchanged
  // (IRMAA is a cost, not an account outflow, in this scenario).
  totalTax: 44_576_110,
  totalRiderFee: 1_870_297,
};

// ---- GI master: compound roll-up income, single, deferral to 74 ----
const gi = summarize(makeClient({
  blueprint_type: 'compound-rollup-income', filing_status: 'single', age: 62, end_age: 92, state: 'TX',
  qualified_account_value: 90_000_000, gi_conversion_years: 5, gi_conversion_bracket: 24,
  income_start_age: 74, payout_type: 'individual', ssi_annual_amount: 3_000_000,
}));

// Re-locked v70 (2026-06-30) for the GI engine rework F15/F16/F17. The strategy
// numbers moved (baseline UNCHANGED — only the strategy side was touched):
//   • F15 replaced the flat conversionBracket% conversion tax with the
//     progressive marginal tax. This single TX filer converts ~$180K/yr, whose
//     effective rate (~19%) is below the old flat 24% — so less tax is withheld
//     from the IRA (gross-up path: taxable_accounts=0), MORE is converted
//     (748,857 → 814,597K), totalTax drops (250,341 → 194,014K), and the larger
//     Roth annuity lifts final net worth (3,218,623 → 3,463,649K) and rider fees.
//   • F16 adds income-phase tax on pension/taxable-SS; here it's ~$0 (Roth GI
//     keeps provisional income below the SS threshold for $30K SS, no pension).
//   • F17 (Roth annuity no longer heir-taxed) doesn't move these 4 fields.
// Verified: invariants 0 breaches; the gi-bug-quantify diagnostic ties the new
// conversion + income tax to an independent progressive recompute to the dollar.
// baseFinalNetWorth + totalTax re-locked v71 (2026-07-05): IRMAA 2026 brackets
// corrected to actual CMS figures (Lori Avant ticket). Raised thresholds drop
// this single/TX filer a tier in some years → less lifetime IRMAA (totalTax
// 19,401,440 → 19,330,040) and a slightly higher do-nothing net worth
// (355,548,789 → 355,783,006). Strategy net worth / conversions unchanged.
const GI_EXPECTED = {
  baseFinalNetWorth: 355_783_006,
  baseFinalTraditional: 0,
  formulaFinalNetWorth: 346_364_931,
  formulaFinalRoth: 0,
  totalConversions: 81_459_692,
  totalTax: 19_330_040,
  totalRiderFee: 22_588_240,
};

console.log('=== GROWTH actuals ===');
console.log(JSON.stringify(growth, null, 2));
console.log('=== GI actuals ===');
console.log(JSON.stringify(gi, null, 2));

for (const [k, v] of Object.entries(GROWTH_EXPECTED)) eq((growth as any)[k], v, `growth.${k}`);
for (const [k, v] of Object.entries(GI_EXPECTED)) eq((gi as any)[k], v, `gi.${k}`);

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) { for (const f of fails) console.error(f); }
process.exit(failed > 0 ? 1 : 0);
