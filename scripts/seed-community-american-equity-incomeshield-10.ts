/**
 * Seed the "American Equity IncomeShield 10 (10% Rollup LIBR)" community product.
 *
 * Usage: npx tsx scripts/seed-community-american-equity-incomeshield-10.ts
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
 *
 * Source illustration: American Equity IncomeShield 10, prepared for Jeff & Gay
 * Forsberg by Dr. Elnora T Webb (Annuities Genius), 07/10/2026. Joint payout,
 * Lifetime Income Benefit Rider with the 10% Rollup & Wellbeing Rider, income
 * activation age 66, 1.20% rider fee.
 *
 * ENGINE: `simple-rollup-income` (archetype `income-simple-both`). The GI engine's
 * simple roll-up credits `rate × ORIGINAL income base` each year (true simple
 * interest), floored/capped at roll_up_max_years — exactly the rider's "IAV Rate
 * is 10% Simple Interest, 10-year accumulation" mechanic.
 *
 * KEY PRODUCT FACTS (from the illustration):
 *  - 10% SIMPLE roll-up on the Income Account Value, 10-year accumulation (or
 *    until income starts). Roll-up stops once income begins.
 *  - Rider fee 1.20% of the Income Account Value (benefit base), deducted from the
 *    contract value each year the rider is attached. Verified: yr1 charge $2,376 =
 *    1.20% × $198,000 benefit base.
 *  - Bonus: NONE on this election (the "Annuity Bonus: None" line). The real
 *    product's premium bonus VARIES BY STATE (the platform preset uses ~14% on both
 *    AV and IAV as a generic default); this specific 10%-rollup LIBR election has
 *    no annuity bonus, so bonus.percentage = 0 here.
 *  - Payout: Joint. Withdrawal % by age at income start, from the illustration's
 *    "Guaranteed Lifetime Income Based on Start Year" table (page 10):
 *      61:5.76 62:6.19 63:6.29 64:6.44 65:6.64 66:6.69 67:6.87 68:7.16 69:7.28
 *      70:7.69 71:8.13  (JOINT — the whole illustration is joint).
 *    Level income after activation (the "increasing income" is NOT modeled; this
 *    is the income floor).
 *  - Surrender charge: 9.2/9/8/7/6/5/4/3/2/1 (10-yr). MVA applies. Free withdrawals
 *    10% of contract value beginning in year 2. Issue ages 40-80, $5k-$1.5M.
 *  - Not available in: CA, GU, NY, PR, VI.
 *
 * MODELING NOTES / APPROXIMATIONS (why this is curated, not self-served):
 *  - SINGLE-PREMIUM model: the illustration used 4 annual $180k flexible premiums
 *    ($720k). The platform models a single premium. The GUARANTEED benefit base +
 *    income still reconcile to the dollar for a single premium chosen so the base
 *    matches (e.g. $660k single → base 660k×1.8 = $1,188,000 at age 66 → ×6.69% =
 *    $79,477, the illustration's income). Intermediate year-by-year benefit-base
 *    dollars differ (flexible vs single) but converge at income start.
 *  - SINGLE-life payout factors are ESTIMATED (single ≈ joint + 0.5%); the
 *    illustration only provides the joint table. Joint factors below 61 / above 71
 *    are extrapolated (est.). The core joint 61-71 values are the carrier's.
 *  - Wellbeing/chronic-illness income doubler: available but NOT modeled.
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// JOINT withdrawal % by age at income start — carrier values for 61-71 (page 10),
// extrapolated outside that band (estimated). Single ≈ joint + 0.5% (estimated;
// the illustration only gives the joint table).
const ILLUS_JOINT: Record<number, number> = {
  61: 5.76, 62: 6.19, 63: 6.29, 64: 6.44, 65: 6.64, 66: 6.69,
  67: 6.87, 68: 7.16, 69: 7.28, 70: 7.69, 71: 8.13,
};
const single: Record<string, number> = {};
const joint: Record<string, number> = {};
for (let age = 50; age <= 90; age++) {
  let j: number;
  if (ILLUS_JOINT[age] != null) j = ILLUS_JOINT[age];
  else if (age < 61) j = Math.round((5.76 - (61 - age) * 0.18) * 100) / 100; // est. below 61
  else j = Math.min(9.0, Math.round((8.13 + (age - 71) * 0.25) * 100) / 100); // est. above 71, cap 9.0%
  j = Math.max(0, j);
  joint[String(age)] = j;
  single[String(age)] = Math.round((j + 0.5) * 100) / 100; // est. single = joint + 0.5%
}

const row = {
  name: "American Equity IncomeShield 10 (10% Rollup LIBR)",
  description:
    "American Equity IncomeShield 10 fixed index annuity with the Lifetime Income Benefit Rider (10% Rollup & Wellbeing). Modeled on the simple-rollup income engine: 10% SIMPLE roll-up on the Income Account Value for up to 10 years (or until income starts), 1.20% annual rider fee on the Income Account Value, joint payout factors from the carrier illustration (6.69% at age 66). This election carries NO annuity bonus (the product's premium bonus varies by state). Level income after activation (increasing income and the Wellbeing chronic-illness doubler are not modeled). Single-premium model; the guaranteed benefit base + income reconcile to the carrier illustration to the dollar. Not available in CA, GU, NY, PR, VI.",
  carrier_name: "American Equity Investment Life Insurance Company",
  carrier_product_name:
    "American Equity IncomeShield 10 — Lifetime Income Benefit Rider (10% Simple Rollup + Wellbeing)",
  category: "income" as const,
  archetype: "income-simple-both" as const,
  engine_preset: "simple-rollup-income" as const,
  modifier_flags: ["has_annual_fee", "has_mva"] as string[],
  config: {
    bonus: {
      percentage: 0, // this LIBR election: Annuity Bonus = None (real product's bonus varies by state)
      type: "immediate" as const,
      applies_to: "account_value" as const,
      vesting_years: null,
      vesting_schedule: null,
      anniversary_rate: null,
      anniversary_years: null,
      confidence: "verified" as const,
    },
    surrender: {
      years: 10,
      schedule: [9.2, 9, 8, 7, 6, 5, 4, 3, 2, 1],
      confidence: "verified" as const,
    },
    fees: {
      annual_rider_fee: 1.2, // 1.20% of the Income Account Value (benefit base)
      fee_duration: "lifetime" as const, // charged each year the rider is attached
      confidence: "verified" as const,
    },
    withdrawals: {
      penalty_free_percent: 10, // 10% of contract value, beginning year 2
      year_1_rule: "custom" as const,
      year_1_custom_percent: 0, // no free withdrawal in year 1
      cumulative_withdrawal: false,
      cumulative_percent: null,
      confidence: "verified" as const,
    },
    income: {
      roll_up_type: "simple" as const,
      roll_up_rate: 10, // 10% simple interest on the original Income Account Value
      roll_up_interest_multiple: null,
      roll_up_credit_basis: "income_base" as const, // (simple path credits rate × original base; basis is a no-op for 'simple')
      roll_up_split_rate: false,
      roll_up_rate_years_1_5: null,
      roll_up_rate_years_6_10: null,
      roll_up_max_years: 10, // 10-year accumulation, or until income starts
      // Classic GLWB: the income base LOCKS at activation and the death benefit is
      // the CONTRACT VALUE (page 8), not the benefit base — so the income base does
      // NOT draw down. (The engine's draws_down mechanic is pro-rata by income/AV,
      // meant for enhanced-DB products like Athene Agility whose benefit base IS the
      // heir benefit; wrong for IncomeShield. The illustration's cosmetic
      // benefit-base runoff column is not reproduced and doesn't affect income or
      // the heir benefit, which is driven by the account/Roth balance.)
      benefit_base_draws_down: false,
      increasing_income_basis: "fixed" as const, // level income after activation (increasing income NOT modeled)
      bonus_applies_to: "income_base" as const,
      payout_factors: { single, joint },
      payout_increment_per_year: 0,
      enhanced_income: {
        // Wellbeing chronic-illness income doubler — stored for documentation; NOT applied by the engine.
        included: true,
        multiplier_single: 2,
        multiplier_joint: 1.5,
        max_years: 5,
        waiting_period: 2,
      },
      confidence: "assumed" as const, // single-life factors + <61/>71 joint factors are estimated
    },
    other: {
      mva_applies: true,
      return_of_premium_year: null,
      min_premium: 5000,
      max_premium: 1500000,
      min_issue_age: 40,
      max_issue_age: 80,
      confidence: "verified" as const,
    },
    state_availability: {
      not_available: ["CA", "GU", "NY", "PR", "VI"],
      bonus_overrides: {},
      age_overrides: {},
      mva_overrides: {},
      surrender_overrides: {},
      vesting_overrides: {},
      min_premium_overrides: {},
      confidence: "verified" as const,
    },
    form_defaults: {
      // The guaranteed income is rate-independent (driven by the guaranteed 10%
      // benefit-base roll-up). This assumed rate only affects the ACCOUNT VALUE
      // (surrender/legacy). The illustration's 100% 2-yr Nasdaq Premier PTP (80%
      // par) showed a most-recent-10yr AER of 11.73%; a conservative planning
      // default is used here. Advisors should set per client/scenario.
      rate_of_return: 6.0,
    },
  },
  source_custom_product_id: null as string | null,
  created_by: null as string | null,
  is_published: true,
};

(async () => {
  const { data, error } = await admin
    .from("community_products")
    .upsert(row, { onConflict: "name" })
    .select("id, name, is_published")
    .single();
  if (error) {
    console.error("Seed failed:", error.message);
    process.exit(1);
  }
  console.log(`Seeded community product: ${data.name} (id=${data.id}, published=${data.is_published})`);
  console.log("GI FIA | simple-rollup-income | 10% simple / 10yr | 1.20% rider on IAV | joint 6.69%@66 | 0 bonus");
  process.exit(0);
})();
