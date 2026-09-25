/**
 * Validate our growth engine against the Knighthead Life Chartline Bonus
 * 10-Year illustration (Maurice Nasrallah, FL, $2,000,000, age 74, prepared
 * 09/22/2026, producer Jorge Tola).
 *
 * GROUND TRUTH: the carrier's "Guaranteed Illustrated Values" page (p.5). It is
 * the only deterministic page: $2,000,000 premium + 20% bonus = $2,400,000 at
 * issue, 0.00% credited every year, no withdrawal in year 1, then a 10% free
 * withdrawal of the prior-anniversary contract value every year from year 2.
 * The non-guaranteed page (p.6) runs a 50/50 S&P-cap / Risk-Control blend on
 * backcast index returns (4.80%, 9.40%, 0.00%, ...) which a flat-rate engine
 * cannot be held to.
 *
 * Two checks:
 *   A. Pure growth at 0% with no withdrawals — contract value must stay at
 *      $2,400,000 every year (bonus credited immediately, no fee, no decay).
 *   B. Guaranteed page: 0% growth + 10% withdrawals from year 2. The engine
 *      takes withdrawals as fixed dollar amounts per year, so we feed it the
 *      carrier's own withdrawal column and check the resulting contract value.
 *
 * Runs in pure-growth mode (age forced below RMD age, no SS, no conversions)
 * so nothing but the FIA accumulation math is under test.
 *
 * Usage: npx tsx scripts/validate-knighthead-chartline-bonus-10.ts
 */

import { runGrowthSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";
import type { CustomProductRow } from "../lib/products/types";

// Illustration p.5 — Guaranteed Illustrated Values.
// Contract year → { withdrawal, contract value } in dollars.
const GUARANTEED: Record<number, { wd: number; cv: number }> = {
  1: { wd: 0, cv: 2_400_000 },
  2: { wd: 240_000, cv: 2_160_000 },
  3: { wd: 216_000, cv: 1_944_000 },
  4: { wd: 194_400, cv: 1_749_600 },
  5: { wd: 174_960, cv: 1_574_640 },
  6: { wd: 157_464, cv: 1_417_176 },
  7: { wd: 141_718, cv: 1_275_458 },
  8: { wd: 127_546, cv: 1_147_913 },
  9: { wd: 114_791, cv: 1_033_121 },
  10: { wd: 103_312, cv: 929_809 },
  11: { wd: 92_981, cv: 836_828 },
  12: { wd: 83_683, cv: 753_145 },
  13: { wd: 75_315, cv: 677_831 },
  14: { wd: 67_783, cv: 610_048 },
  15: { wd: 61_005, cv: 549_043 },
  16: { wd: 54_904, cv: 494_139 },
  17: { wd: 49_414, cv: 444_725 },
  18: { wd: 44_472, cv: 400_252 },
  19: { wd: 40_025, cv: 360_227 },
  20: { wd: 37_919, cv: 322_308 },
};

const PREMIUM_DOLLARS = 2_000_000;
const HORIZON = 30;
const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;

// The product config, exactly as the seed script will store it.
const product = {
  id: "validation-only",
  user_id: "validation-only",
  name: "Knighthead Chartline Bonus 10",
  carrier_name: "Knighthead Life (Merit Life Insurance Co.)",
  carrier_product_name: "Chartline Bonus — 10-Year Withdrawal Charge Period",
  category: "growth",
  archetype: "growth-immediate",
  engine_preset: "high-bonus-long-term-growth",
  modifier_flags: ["has_mva"],
  config: {
    bonus: {
      percentage: 20,
      type: "immediate",
      applies_to: "account_value",
      vesting_years: null,
      vesting_schedule: null,
      anniversary_rate: null,
      anniversary_years: null,
      confidence: "verified",
    },
    surrender: {
      years: 10,
      schedule: [9, 9, 8, 7, 6, 5, 4, 3, 2, 1],
      confidence: "verified",
    },
    fees: {
      annual_rider_fee: 0,
      fee_duration: "surrender_period",
      confidence: "verified",
    },
    withdrawals: {
      penalty_free_percent: 10,
      year_1_rule: "custom",
      year_1_custom_percent: 0,
      cumulative_withdrawal: false,
      cumulative_percent: null,
      confidence: "verified",
    },
    income: null,
    other: {
      mva_applies: true,
      return_of_premium_year: null,
      min_premium: 25_000,
      max_premium: 2_000_000,
      min_issue_age: 0,
      max_issue_age: 80,
      confidence: "verified",
    },
    form_defaults: { rate_of_return: 6.0 },
    state_availability: {
      not_available: ["NY", "VT", "NH", "MA", "CT"],
      bonus_overrides: {},
      age_overrides: {},
      mva_overrides: {},
      surrender_overrides: {},
      vesting_overrides: {},
      min_premium_overrides: {},
      confidence: "verified",
    },
  },
  source: "manual",
  community_product_id: null,
  ai_research_sources: null,
  ai_warnings: null,
  ai_unsupported_features: null,
  is_favorite: false,
  is_archived: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
} as unknown as CustomProductRow;

const cfg = product.config;

function client(rate: number, withdrawals: Array<{ year: number; age: number; amount: number }>): Client {
  return {
    age: 40,
    spouse_age: 38,
    end_age: 40 + HORIZON,
    filing_status: "single",
    state: "FL",
    blueprint_type: product.engine_preset,
    custom_product_id: product.id,
    bonus_percent: cfg.bonus.percentage,
    surrender_years: cfg.surrender.years,
    surrender_schedule: cfg.surrender.schedule,
    penalty_free_percent: cfg.withdrawals.penalty_free_percent,
    rate_of_return: rate,
    post_contract_rate: rate,
    qualified_account_value: PREMIUM_DOLLARS * 100, // engine works in CENTS
    taxable_accounts: 0,
    roth_ira: 0,
    conversion_type: "no_conversion",
    withdrawal_type: withdrawals.length ? "custom" : "no_withdrawals",
    withdrawals: withdrawals.map((w) => ({ ...w, source: "ira", net: false })),
    rmd_treatment: "reinvested",
    respect_penalty_free_limit: false,
    ssi_annual_amount: 0,
    spouse_ssi_annual_amount: 0,
    ss_self: 0,
    ss_spouse: 0,
    ssi_payout_age: 67,
    spouse_ssi_payout_age: 67,
    non_ssi_income: [],
    projection_years: HORIZON,
  } as unknown as Client;
}

const startYear = new Date().getFullYear();
const cv = (row: { traditionalBalance?: number; rothBalance?: number }) =>
  ((row.traditionalBalance ?? 0) + (row.rothBalance ?? 0)) / 100;

console.log("\nKnighthead Chartline Bonus 10 — engine vs carrier illustration");
console.log(`Premium ${fmt(PREMIUM_DOLLARS)} + 20% bonus = ${fmt(PREMIUM_DOLLARS * 1.2)} at issue\n`);

// ---- A. 0% growth, no withdrawals: bonus in full, no fees, flat forever ----
const a = runGrowthSimulation(createSimulationInput(client(0, []), product));
let worstA = 0;
for (let y = 1; y <= 20; y++) {
  const d = cv(a.formula[y - 1]) - 2_400_000;
  if (Math.abs(d) > Math.abs(worstA)) worstA = d;
}
console.log(`A. 0% credited, no withdrawals — years 1–20 vs $2,400,000: worst drift ${fmt(worstA)} ${Math.abs(worstA) < 1 ? "✓" : "✗"}`);

// ---- B. Guaranteed page: 0% growth, carrier's own withdrawal column --------
const wds = Object.entries(GUARANTEED)
  .filter(([, v]) => v.wd > 0)
  .map(([y, v]) => ({ year: startYear + parseInt(y) - 1, age: 40 + parseInt(y) - 1, amount: v.wd * 100 }));
const b = runGrowthSimulation(createSimulationInput(client(0, wds), product));
console.log("\nB. Guaranteed page (0% credited, 10% withdrawals from year 2)");
console.log("Year | Withdrawal | Illustration CV | Engine CV       | Δ");
console.log("-".repeat(64));
let worstB = 0;
for (const [yearStr, g] of Object.entries(GUARANTEED)) {
  const y = parseInt(yearStr);
  const row = b.formula[y - 1];
  if (!row) continue;
  const engine = cv(row);
  const diff = engine - g.cv;
  if (Math.abs(diff) > Math.abs(worstB)) worstB = diff;
  console.log(
    `${String(y).padStart(4)} | ${fmt(g.wd).padStart(10)} | ${fmt(g.cv).padStart(15)} | ${fmt(engine).padStart(15)} | ${(diff >= 0 ? "+" : "") + fmt(diff)}`
  );
}
console.log("-".repeat(64));
console.log(`Worst absolute drift: ${(worstB >= 0 ? "+" : "") + fmt(worstB)}`);
// Tolerance is $1: the carrier prints each year's withdrawal rounded to whole
// dollars and chains those rounded figures, so its contract value walks off by
// a dollar in some years (e.g. yr 8, 13–17). The engine carries cents.
console.log(
  Math.abs(worstA) < 1 && Math.abs(worstB) <= 1
    ? "MATCH — engine reproduces the carrier's guaranteed page to within $1 (whole-dollar rounding)."
    : "DRIFT DETECTED — investigate before seeding."
);
