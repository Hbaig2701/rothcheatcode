/**
 * Validate our growth engine against the North American Secure Horizon
 * Accelerator illustration (Jeanine Horner, TX, $708,000, prepared 08/14/2026).
 *
 * GROUND TRUTH: the carrier's "Additional Supplemental Illustration — Fixed
 * 5.00% Return" page (illustration p.12). That page is the clean, deterministic
 * one: $708,000 premium + 18% TX premium bonus = $835,440 at issue, then a flat
 * 5.00% net credited rate every year with no strategy charge. It is the only
 * page our flat-rate engine can be held to exactly — the non-guaranteed pages
 * (p.11) run the Performance Strategy Ladder, whose credited rate is lumpy by
 * construction (1.00%, 4.90%, ... 15.66%, then 0%/25.30% alternating on the
 * 2-year point-to-point) because only part of the money is at a term end in any
 * given year. Our engine models a single contract rate + a post-surrender
 * renewal rate, not a per-year rate schedule.
 *
 * This runs the engine in pure-growth mode (age forced below RMD age, no SS, no
 * conversions, no withdrawals) so it isolates the FIA accumulation math.
 *
 * Usage: npx tsx scripts/validate-na-secure-horizon.ts
 */

import { runGrowthSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";
import type { CustomProductRow } from "../lib/products/types";

// Illustration p.12 — "Fixed 5.00% Return", Accumulation Value column.
// Contract year → AV in dollars.
const FIXED_5_PCT: Record<number, number> = {
  1: 877_212, 2: 921_073, 3: 967_126, 4: 1_015_483, 5: 1_066_257,
  6: 1_119_570, 7: 1_175_548, 8: 1_234_325, 9: 1_296_042, 10: 1_360_844,
  11: 1_428_886, 12: 1_500_330, 13: 1_575_347, 14: 1_654_114, 15: 1_736_820,
  16: 1_823_661, 17: 1_914_844, 18: 2_010_586, 19: 2_111_115, 20: 2_216_671,
  30: 3_610_724,
};

// Illustration p.11 — "NON-GUARANTEED, MOST RECENT PERIOD 12/31/2015-12/31/2025",
// Accumulation Value column. This is the Performance Strategy Ladder running on
// backcast index returns: the credited rate is lumpy (1.00% ... 15.66% in yr 10,
// then alternating 0% / 25.30% on the 2-year point-to-point). Carrier's stated
// annual effective rate: 8.38% over 10 years, 7.48% over 20.
const LADDER_MOST_RECENT: Record<number, number> = {
  1: 843_784, 2: 885_169, 3: 922_840, 4: 997_121, 5: 1_122_862,
  6: 1_266_661, 7: 1_353_813, 8: 1_487_032, 9: 1_615_710, 10: 1_868_683,
  11: 1_868_683, 12: 2_341_390, 13: 2_341_390, 14: 2_509_358, 15: 2_509_358,
  16: 3_091_989, 17: 3_091_989, 18: 3_229_385, 19: 3_229_385, 20: 3_536_103,
  30: 6_768_286,
};

// Rates that make our flat-rate engine track the ladder: the carrier's own
// 10-year AER during the surrender period, then the rate implied by the
// illustration's own yr10 → yr20 growth for the renewal period.
const LADDER_CONTRACT_RATE = 8.38;
const LADDER_POST_CONTRACT_RATE = 6.59;

const PREMIUM_DOLLARS = 708_000;
const ISSUE_AGE = 66;
const HORIZON = 30;

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;

// The product config, exactly as the seed script will store it (TX values:
// 18% bonus, IIPRC/70-10 surrender schedule, no strategy charge).
const product = {
  id: "validation-only",
  user_id: "validation-only",
  name: "North American Secure Horizon Accelerator",
  carrier_name: "North American Company for Life and Health Insurance",
  carrier_product_name: "Secure Horizon Accelerator",
  category: "growth",
  archetype: "growth-immediate",
  engine_preset: "high-bonus-long-term-growth",
  modifier_flags: ["has_mva"],
  config: {
    bonus: {
      percentage: 18, // TX
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
      schedule: [9, 8.5, 7.5, 6.5, 5.5, 4.5, 3.5, 3, 2, 1], // IIPRC / 70-10 (incl. TX)
      confidence: "verified",
    },
    fees: {
      annual_rider_fee: 0, // no Strategy Charge on this build
      fee_duration: "surrender_period",
      confidence: "verified",
    },
    withdrawals: {
      penalty_free_percent: 7,
      year_1_rule: "custom",
      year_1_custom_percent: 0, // penalty-free starts in contract year 2
      cumulative_withdrawal: false,
      cumulative_percent: null,
      confidence: "verified",
    },
    income: null,
    other: {
      mva_applies: true,
      return_of_premium_year: null,
      min_premium: 25_000,
      max_premium: null,
      min_issue_age: 0,
      max_issue_age: 79,
      confidence: "verified",
    },
    form_defaults: { rate_of_return: 5.0 },
    state_availability: {
      not_available: ["OR"],
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

// Pure-growth client: age forced well below RMD age and all income zeroed, so
// nothing but the FIA accumulation math is under test.
const client = {
  age: 40,
  spouse_age: 38,
  end_age: 40 + HORIZON,
  filing_status: "single",
  state: "TX",
  blueprint_type: product.engine_preset,
  custom_product_id: product.id,
  bonus_percent: cfg.bonus.percentage,
  surrender_years: cfg.surrender.years,
  surrender_schedule: cfg.surrender.schedule,
  penalty_free_percent: cfg.withdrawals.penalty_free_percent,
  rate_of_return: cfg.form_defaults?.rate_of_return ?? 5,
  qualified_account_value: PREMIUM_DOLLARS * 100, // engine works in CENTS
  taxable_accounts: 0,
  roth_ira: 0,
  conversion_type: "no_conversion",
  withdrawal_type: "no_withdrawals",
  withdrawals: [],
  rmd_treatment: "reinvested",
  ssi_annual_amount: 0,
  spouse_ssi_annual_amount: 0,
  ss_self: 0,
  ss_spouse: 0,
  ssi_payout_age: 67,
  spouse_ssi_payout_age: 67,
  non_ssi_income: [],
  projection_years: HORIZON,
} as unknown as Client;

const result = runGrowthSimulation(createSimulationInput(client, product));

console.log("\nNorth American Secure Horizon Accelerator — engine vs carrier illustration");
console.log(`Premium ${fmt(PREMIUM_DOLLARS)} + 18% TX bonus = ${fmt(PREMIUM_DOLLARS * 1.18)} at issue`);
console.log(`Ground truth: illustration p.12, "Fixed 5.00% Return" (issue age ${ISSUE_AGE})\n`);
console.log("Year | Illustration    | Engine          | Δ");
console.log("-".repeat(52));

let worst = 0;
for (const [yearStr, illustration] of Object.entries(FIXED_5_PCT)) {
  const year = parseInt(yearStr);
  const row = result.formula[year - 1];
  if (!row) continue;
  const engine = ((row.traditionalBalance ?? 0) + (row.rothBalance ?? 0)) / 100;
  const diff = engine - illustration;
  if (Math.abs(diff) > Math.abs(worst)) worst = diff;
  console.log(
    `${String(year).padStart(4)} | ${fmt(illustration).padStart(15)} | ${fmt(engine).padStart(15)} | ` +
      `${(diff >= 0 ? "+" : "") + fmt(diff)}`
  );
}

console.log("-".repeat(52));
console.log(`Worst absolute drift across all checked years: ${(worst >= 0 ? "+" : "") + fmt(worst)}`);
// Tolerance is $1, not 0: the engine carries cents and the illustration prints
// whole dollars, so a matching year lands within sub-dollar float noise.
console.log(
  Math.abs(worst) < 1
    ? "EXACT MATCH — engine reproduces the carrier's Fixed-5% page to the dollar."
    : "DRIFT DETECTED — investigate before seeding."
);

// ---------------------------------------------------------------------------
// MODE 2 — the harder test: how close does one flat rate get to the actual
// Performance Strategy Ladder page? This is what an advisor will really compare
// against, so quantify the gap rather than hand-waving it.
// ---------------------------------------------------------------------------

const ladderResult = runGrowthSimulation(
  createSimulationInput(
    {
      ...client,
      rate_of_return: LADDER_CONTRACT_RATE,
      post_contract_rate: LADDER_POST_CONTRACT_RATE,
    } as unknown as Client,
    product
  )
);

console.log(`\n\nMODE 2 — vs the Performance Strategy Ladder page (illustration p.11)`);
console.log(
  `Engine: flat ${LADDER_CONTRACT_RATE}% during the 10-yr surrender period, ` +
    `${LADDER_POST_CONTRACT_RATE}% thereafter.`
);
console.log("The ladder credits on staggered terms, so expect mid-period drift that closes at term ends.\n");
console.log("Year | Illustration    | Engine          | Δ            | % drift");
console.log("-".repeat(66));

let worstPct = 0;
let worstPctYear = 0;
for (const [yearStr, illustration] of Object.entries(LADDER_MOST_RECENT)) {
  const year = parseInt(yearStr);
  const row = ladderResult.formula[year - 1];
  if (!row) continue;
  const engine = ((row.traditionalBalance ?? 0) + (row.rothBalance ?? 0)) / 100;
  const diff = engine - illustration;
  const pct = (diff / illustration) * 100;
  if (Math.abs(pct) > Math.abs(worstPct)) {
    worstPct = pct;
    worstPctYear = year;
  }
  console.log(
    `${String(year).padStart(4)} | ${fmt(illustration).padStart(15)} | ${fmt(engine).padStart(15)} | ` +
      `${((diff >= 0 ? "+" : "") + fmt(diff)).padStart(12)} | ${(pct >= 0 ? "+" : "") + pct.toFixed(2)}%`
  );
}
console.log("-".repeat(66));
console.log(
  `Worst drift: ${(worstPct >= 0 ? "+" : "") + worstPct.toFixed(2)}% (contract year ${worstPctYear})\n`
);

