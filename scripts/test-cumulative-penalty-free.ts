/**
 * Tests for the cumulative penalty-free (accumulating free-withdrawal) rule in
 * growth-formula.ts (getEffectiveCumulativePenaltyFree + carry-forward).
 *
 * Covers the core behavior plus the 5 hardening fixes:
 *   1. allowance never drops below the base penalty-free % (misconfig max < base)
 *   2. carry ceiling generalizes to multi-year products (max > 2x base)
 *   3. year_1_rule 'custom' overrides the year-1 base (correct carry)
 *   4. numeric-string cumulative_percent is coerced (not silently disabled)
 *   5. absurd cumulative_percent is clamped, never neutralizes / explodes the cap
 *
 * Run: npx tsx scripts/test-cumulative-penalty-free.ts
 */
import { runGrowthSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";
import type { CustomProductRow, ProductConfigPayload } from "../lib/products/types";

const usd = (c: number) => `$${Math.round((c || 0) / 100).toLocaleString()}`;
let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗ FAIL"}: ${m}`); if (!c) fails++; };

type WOpts = { cumulative?: boolean; pf?: number; cumPct?: number | string | null; surrender?: number; year1Rule?: string; year1Pct?: number | null };
function makeConfig(o: WOpts = {}): ProductConfigPayload {
  return {
    bonus: { percentage: 0, type: "immediate", applies_to: "account_value", vesting_years: null, vesting_schedule: null, anniversary_rate: null, anniversary_years: null, confidence: "verified" },
    surrender: { years: o.surrender ?? 10, schedule: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1], confidence: "verified" },
    fees: { annual_rider_fee: 0, fee_duration: "surrender_period", confidence: "verified" },
    withdrawals: { penalty_free_percent: o.pf ?? 10, year_1_rule: (o.year1Rule ?? "same") as any, year_1_custom_percent: o.year1Pct ?? null, cumulative_withdrawal: o.cumulative ?? false, cumulative_percent: (o.cumulative ? (o.cumPct === undefined ? 20 : o.cumPct) : null) as any, confidence: "verified" },
    income: null,
    other: { mva_applies: true, return_of_premium_year: null, min_premium: 25000, max_premium: null, min_issue_age: 0, max_issue_age: 80, confidence: "verified" },
    form_defaults: { rate_of_return: 5 },
    state_availability: { not_available: [], bonus_overrides: {}, age_overrides: {}, mva_overrides: {}, surrender_overrides: {}, vesting_overrides: {}, min_premium_overrides: {}, confidence: "verified" },
  } as ProductConfigPayload;
}
function makeProduct(o: WOpts = {}): CustomProductRow {
  return { id: "p", user_id: "u", name: "T", carrier_name: "A", carrier_product_name: "PE", category: "growth", archetype: "growth-no-bonus", engine_preset: "short-term-cap-growth", modifier_flags: [], config: makeConfig(o), source: "manual", community_product_id: null, ai_research_sources: null, ai_warnings: null, ai_unsupported_features: null, is_favorite: false, is_archived: false, created_at: "", updated_at: "" } as CustomProductRow;
}
function makeClient(o: Partial<Client>): Client {
  const b: any = {
    id: "c", user_id: "u", created_at: "", updated_at: "", blueprint_type: "short-term-cap-growth", scenario_name: null, filing_status: "married_filing_jointly", name: "C", age: 65, spouse_name: "S", spouse_age: 64, qualified_account_value: 2_000_000_00, carrier_name: "A", product_name: "PE", bonus_percent: 0, rate_of_return: 5, anniversary_bonus_percent: null, anniversary_bonus_years: null, state: "IL", constraint_type: "bracket_ceiling", tax_rate: 24, max_tax_rate: 37, tax_payment_source: "from_ira", state_tax_rate: 0, gross_taxable_non_ssi: 0, tax_exempt_non_ssi: 0, ssi_payout_age: 70, ssi_annual_amount: 0, spouse_ssi_payout_age: 70, spouse_ssi_annual_amount: 0, non_ssi_income: [], conversion_type: "full_conversion", fixed_conversion_amount: null, target_partial_amount: null, respect_penalty_free_limit: true, penalty_free_scope: "all_distributions", protect_initial_premium: false, aum_allocation_percent: 0, aum_fee_percent: 1, aum_dividend_yield: 2, aum_turnover_percent: 10, aum_withdrawal_years: 5, ltcg_rate: 15, withdrawal_type: "no_withdrawals", payout_type: "individual", income_start_age: 66, guaranteed_rate_of_return: 0, roll_up_option: null, payout_option: null, gi_conversion_years: 5, gi_conversion_bracket: 24, surrender_years: 10, surrender_schedule: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1], penalty_free_percent: 10, baseline_comparison_rate: 5, post_contract_rate: 5, years_to_defer_conversion: 1, end_age: 95, heir_tax_rate: 40, widow_analysis: false, rmd_treatment: "reinvested", date_of_birth: "1961-01-01", spouse_dob: "1962-01-01", life_expectancy: 95, traditional_ira: 0, roth_ira: 0, taxable_accounts: 0, other_retirement: 0, federal_bracket: "auto", include_niit: false, include_aca: false, ss_self: 0, ss_spouse: 0, pension: 0, other_income: 0, ss_start_age: 70, strategy: "aggressive", start_age: 65, growth_rate: 5, inflation_rate: 0, heir_bracket: "40", projection_years: 30, sensitivity: false,
  };
  return { ...b, ...o } as Client;
}
const convs = (c: Client, p: CustomProductRow | null) => runGrowthSimulation(createSimulationInput(c, p)).formula.map((y: any) => y.conversionAmount ?? 0);

console.log("=== Core: cumulative lifts year-2 room 10%→20% after a skipped year 1 ===");
const cumF = convs(makeClient({}), makeProduct({ cumulative: true }));
const flatF = convs(makeClient({}), makeProduct({ cumulative: false }));
const ratio = (cumF[1] || 0) / (flatF[1] || 1);
console.log(`  yr1=${usd(cumF[0])}  yr2 cum=${usd(cumF[1])} flat=${usd(flatF[1])} ratio=${ratio.toFixed(2)}x`);
ok((cumF[0] ?? 0) < 1_000_00, "year 1 deferred (≈0)");
ok(ratio >= 1.7 && ratio <= 2.15, `year-2 room ≈ 2x flat (10%→20%): ${ratio.toFixed(2)}x`);
ok((cumF[2] || 0) / (flatF[2] || 1) < 1.35, "year 3 falls back toward flat once carry is spent");

console.log("\n=== Regression: cap OFF ⇒ cumulative vs flat byte-identical ===");
const offCum = convs(makeClient({ respect_penalty_free_limit: false }), makeProduct({ cumulative: true }));
const offFlat = convs(makeClient({ respect_penalty_free_limit: false }), makeProduct({ cumulative: false }));
ok(offCum.every((v, i) => v === offFlat[i]), "identical projections when the penalty-free cap is off");

console.log("\n=== Fix 1: cumulative_percent (5) < base (10) must NOT drop below base ===");
const bad = convs(makeClient({}), makeProduct({ cumulative: true, cumPct: 5 }));
ok((bad[1] || 0) >= (flatF[1] || 0) - 100, `year-2 stays ≥ flat base 10% (${usd(bad[1])} vs flat ${usd(flatF[1])})`);

console.log("\n=== Fix 2: multi-year ceiling (max 30%, base 10%) reaches 30% after 2 skips ===");
const c20 = convs(makeClient({ years_to_defer_conversion: 2 }), makeProduct({ cumulative: true, cumPct: 20 }));
const c30 = convs(makeClient({ years_to_defer_conversion: 2 }), makeProduct({ cumulative: true, cumPct: 30 }));
console.log(`  yr3 max20=${usd(c20[2])}  max30=${usd(c30[2])}`);
ok((c30[2] || 0) > (c20[2] || 0) * 1.25, "max-30% product converts materially more in yr3 than max-20% (carry reached 30%)");

console.log("\n=== Fix 3: year_1_rule 'custom' with year_1_custom_percent=0 ⇒ skipping yr1 carries 0 ===");
const custom0 = convs(makeClient({}), makeProduct({ cumulative: true, year1Rule: "custom", year1Pct: 0 }));
console.log(`  yr2 custom0=${usd(custom0[1])}  (should be ~flat 10%, NOT 20%, since yr1 had no free allowance)`);
ok((custom0[1] || 0) < (cumF[1] || 0) * 0.7, "custom year-1 %=0 does not grant the 20% year-2 catch-up");

console.log("\n=== Fix 4: numeric-string cumulative_percent ('20') is coerced, not disabled ===");
const strCum = convs(makeClient({}), makeProduct({ cumulative: true, cumPct: "20" }));
ok((strCum[1] || 0) > (flatF[1] || 0) * 1.6, `string '20' still lifts year-2 (~2x): ${usd(strCum[1])}`);

console.log("\n=== Fix 5: absurd cumulative_percent (500) clamped — no explosion, finite, bounded by IRA ===");
const absurd = convs(makeClient({}), makeProduct({ cumulative: true, cumPct: 500 }));
ok(absurd.every(Number.isFinite), "no NaN with absurd config");
ok((absurd[1] || 0) <= 2_000_000_00 * 1.10, "year-2 conversion bounded by the actual IRA (no money created)");

console.log("\n=== No NaN / no negatives across the core cumulative run ===");
ok(cumF.every((v) => Number.isFinite(v) && v >= 0), "all conversions finite and non-negative");

console.log(fails === 0 ? "\nALL PASSED" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
