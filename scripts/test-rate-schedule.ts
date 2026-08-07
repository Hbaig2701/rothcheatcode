/**
 * Tests for the per-year variable growth schedule (getEffectiveRateSchedule +
 * growth-formula/baseline wiring). Proves:
 *   1. a scheduled product reproduces the carrier illustration's lumpy account
 *      value to the dollar (incl. the down years),
 *   2. the BASELINE (do-nothing) rides the same schedule (symmetric),
 *   3. a product WITHOUT a schedule is unchanged (flat compounding),
 *   4. no NaN.
 *
 * Run: npx tsx scripts/test-rate-schedule.ts
 */
import { runGrowthSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";
import type { CustomProductRow, ProductConfigPayload } from "../lib/products/types";

const usd = (c: number) => `$${Math.round((c || 0) / 100).toLocaleString()}`;
let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗ FAIL"}: ${m}`); if (!c) fails++; };

// Delaware Momentum Growth — calendar-returns Account Value ($), illustration pages 12-13.
const AV = [1_000_000, 1_012_212, 1_133_011, 1_694_311, 1_845_272, 1_722_017, 1_901_341, 3_189_008, 3_088_595, 4_301_925, 5_474_316];
// Per-year decimal returns derived from consecutive account values (full precision
// ⇒ round(AV[n-1] * rate) === AV[n] - AV[n-1] exactly ⇒ reproduces AV to the dollar).
const schedule = AV.slice(1).map((v, i) => (v - AV[i]) / AV[i]);

function makeConfig(withSchedule: boolean): ProductConfigPayload {
  return {
    bonus: { percentage: 0, type: "immediate", applies_to: "account_value", vesting_years: null, vesting_schedule: null, anniversary_rate: null, anniversary_years: null, confidence: "verified" },
    surrender: { years: 10, schedule: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1], confidence: "verified" },
    fees: { annual_rider_fee: 0, fee_duration: "surrender_period", confidence: "verified" },
    withdrawals: { penalty_free_percent: 10, year_1_rule: "same", year_1_custom_percent: null, cumulative_withdrawal: false, cumulative_percent: null, confidence: "verified" },
    income: null,
    other: { mva_applies: true, return_of_premium_year: null, min_premium: 25000, max_premium: null, min_issue_age: 0, max_issue_age: 80, confidence: "verified" },
    form_defaults: { rate_of_return: 5 },
    state_availability: { not_available: [], bonus_overrides: {}, age_overrides: {}, mva_overrides: {}, surrender_overrides: {}, vesting_overrides: {}, min_premium_overrides: {}, confidence: "verified" },
    ...(withSchedule ? { rate_schedule: schedule } : {}),
  } as ProductConfigPayload;
}
function makeProduct(withSchedule: boolean): CustomProductRow {
  return { id: "p", user_id: "u", name: "Delaware MG", carrier_name: "Delaware Life", carrier_product_name: "Momentum Growth", category: "growth", archetype: "growth-no-bonus", engine_preset: "short-term-cap-growth", modifier_flags: [], config: makeConfig(withSchedule), source: "manual", community_product_id: null, ai_research_sources: null, ai_warnings: null, ai_unsupported_features: null, is_favorite: false, is_archived: false, created_at: "", updated_at: "" } as CustomProductRow;
}
function makeClient(): Client {
  return {
    id: "c", user_id: "u", created_at: "", updated_at: "", blueprint_type: "short-term-cap-growth", scenario_name: null,
    filing_status: "single", name: "Valued Client", age: 64, spouse_name: null, spouse_age: null, qualified_account_value: 1_000_000_00,
    carrier_name: "Delaware Life", product_name: "Momentum Growth", bonus_percent: 0, rate_of_return: 5, anniversary_bonus_percent: null,
    anniversary_bonus_years: null, state: "FL", constraint_type: "bracket_ceiling", tax_rate: 24, max_tax_rate: 24, tax_payment_source: "from_taxable",
    state_tax_rate: 0, gross_taxable_non_ssi: 0, tax_exempt_non_ssi: 0, ssi_payout_age: 70, ssi_annual_amount: 0, spouse_ssi_payout_age: 70,
    spouse_ssi_annual_amount: 0, non_ssi_income: [], conversion_type: "no_conversion", fixed_conversion_amount: null, target_partial_amount: null,
    respect_penalty_free_limit: false, protect_initial_premium: false, aum_allocation_percent: 0, aum_fee_percent: 1, aum_dividend_yield: 2,
    aum_turnover_percent: 10, aum_withdrawal_years: 5, ltcg_rate: 15, withdrawal_type: "no_withdrawals", payout_type: "individual", income_start_age: 65,
    guaranteed_rate_of_return: 0, roll_up_option: null, payout_option: null, gi_conversion_years: 5, gi_conversion_bracket: 24, surrender_years: 10,
    surrender_schedule: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1], penalty_free_percent: 10, baseline_comparison_rate: 5, post_contract_rate: 5,
    years_to_defer_conversion: 0, end_age: 100, heir_tax_rate: 40, widow_analysis: false, rmd_treatment: "reinvested", date_of_birth: "1962-01-01",
    spouse_dob: null, life_expectancy: 100, traditional_ira: 0, roth_ira: 0, taxable_accounts: 0, other_retirement: 0, federal_bracket: "auto",
    include_niit: false, include_aca: false, ss_self: 0, ss_spouse: 0, pension: 0, other_income: 0, ss_start_age: 70, strategy: "moderate",
    start_age: 64, growth_rate: 5, inflation_rate: 0, heir_bracket: "40", projection_years: 36, sensitivity: false,
  } as unknown as Client;
}

const withF = runGrowthSimulation(createSimulationInput(makeClient(), makeProduct(true)));
const noF = runGrowthSimulation(createSimulationInput(makeClient(), makeProduct(false)));

console.log("=== 1. Scheduled product reproduces illustration account value to the dollar (pre-RMD yrs 1-8) ===");
console.log("Yr Age | ours (annuity AV) | illustration");
for (let n = 1; n <= 8; n++) {
  const av = withF.formula[n - 1].traditionalBalance ?? 0;
  const exp = AV[n] * 100;
  console.log(`${String(n).padStart(2)} ${withF.formula[n-1].age} | ${usd(av).padEnd(12)} | ${usd(exp)}  ${av === exp ? "✓" : "Δ " + usd(av-exp)}`);
  ok(av === exp, `year ${n} annuity AV = illustration ${usd(exp)}`);
}

console.log("\n=== 2. Baseline (do-nothing) rides the SAME schedule (symmetric) ===");
for (let n = 1; n <= 8; n++) ok((withF.baseline[n-1].traditionalBalance ?? 0) === AV[n] * 100, `baseline year ${n} AV = ${usd(AV[n]*100)}`);

console.log("\n=== 3. No-schedule product is UNCHANGED — flat compounding, not lumpy ===");
const y1flat = noF.formula[0].traditionalBalance ?? 0;
ok(y1flat === Math.round(1_000_000_00 * 1.05), `no-schedule year 1 = flat $1M×1.05 = ${usd(y1flat)} (not the lumpy $1,012,212)`);
ok((noF.formula[4].traditionalBalance ?? 0) === Math.round(1_000_000_00 * Math.pow(1.05, 5)), "no-schedule year 5 = flat 1.05^5 (no down year)");

console.log("\n=== 4. No NaN / negatives ===");
ok(withF.formula.every((y: any) => Number.isFinite(y.traditionalBalance) && (y.traditionalBalance ?? 0) >= 0), "scheduled run: all finite, non-negative");
ok(withF.baseline.every((y: any) => Number.isFinite(y.traditionalBalance)), "baseline: all finite");

console.log(fails === 0 ? "\nALL PASSED" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
