/**
 * One-shot admin script to seed the Athene Agility 10 (Guaranteed-Income FIA
 * with the included Income & Death Benefit Rider) into a user's product library.
 *
 * Usage:  npx tsx scripts/seed-athene-agility-10.ts <email>
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
 *
 * Source: David Abreu (Pacific United Financial) illustration + profile —
 *   "Athene Agility 10", prepared for Karen Gervasoni, CA, age 55, $300,000
 *   Traditional IRA, income activation age 65, 06/16/2026.
 *
 * Built the SAME way as the Allianz 222+ (see seed-allianz-222.ts): a GI custom
 * product on the `flat-rate-compound-income` engine, using the performance-linked
 * roll-up (`roll_up_interest_multiple`). Agility's multiple is 2.0 (200% of
 * interest credits) vs the 222's 1.5.
 *
 * KEY PRODUCT FACTS (from the illustration/profile):
 *  - Income base bonus 55% (Benefit Base = $300k × 1.55 = $465,000). NO account-
 *    value/annuity bonus. Rider fee: NONE.
 *  - Performance-driven roll-up: "200% of Interest Credits", until age 95.
 *  - 10-year income wait; payout (Lifetime Withdrawal) rate 4.0%@60 → 5.0%@65 →
 *    5.5%@70 (+0.2/yr to 65, +0.1/yr after). $465k × 5.0% = $23,250 income @65
 *    in the guaranteed (0%) case — matches the illustration exactly.
 *  - Enhanced Death Benefit: Benefit Base paid to heirs in equal payments over 5
 *    years (the illustration's "Death Benefit Over 5 Years" column). [Not modeled
 *    by the GI engine — see note below.]
 *  - Enhanced Income Benefit: care-facility income doubler; NOT available in CA.
 *  - Surrender Most States [9,9,8,7,6,5,4,3,2,1]; CA [9,8,6.9,5.8,4.7,3.6,2.4,1.3,0.1].
 *  - MVA yes, Return of Premium NO, not-available GU/NY/PR/VI, $5k-min in
 *    AK/HI/MN/MO/NJ/OR/PA/TX/UT/WA, issue age 40-80.
 *
 * MODELING NOTES / APPROXIMATIONS (why this is curated, not self-served):
 *  - The 200%-of-credits roll-up uses roll_up_credit_basis 'account_value': the
 *    income base grows by 2.0 × the DOLLARS credited to the Accumulated Value
 *    (multiple × rate × AV), exactly as the carrier states. Verified to the
 *    dollar against the illustration (yr2 $465,913 + 2×$79,289 = $624,491).
 *    NOTE: this is NOT the same as compounding the base at 2×rate (the old
 *    approximation) — because the benefit base starts above the AV, that
 *    overstated the roll-up. The 222 still uses the compound-on-base mechanic
 *    (150% of the interest RATE), which matches Allianz.
 *  - The 10-year income WAIT is a client setting (income_start_age = issue+10),
 *    not a product field.
 *  - "Increasing income" (benefit base keeps rolling during the income phase) is
 *    NOT modeled — the engine pays level income after activation. So this models
 *    the income FLOOR; the real product's income rises over time.
 *  - The Enhanced Death Benefit (5-year benefit-base payout) and the care-
 *    facility income doubler are stored here for documentation but are NOT
 *    applied by the engine. (The legacy/enhanced-DB display is exactly the
 *    feature David asked about for the 222 — still to be built.)
 *  - form_defaults.rate_of_return = 5.0%: calibrated so income @65 reproduces the
 *    illustration's current-rates ~$60k. Guaranteed (0%) gives $23,250 exactly.
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const email = process.argv[2];
if (!email) {
  console.error("Usage: npx tsx scripts/seed-athene-agility-10.ts <email>");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// Payout factors (Lifetime Withdrawal Rate, single %). Anchored to the
// illustration: 4.0%@60 → 5.0%@65 → 5.5%@70 (+0.2/yr up to 65, +0.1/yr after).
// Ages outside 60-70 are extrapolated (estimated) and capped at 7.0%.
const single: Record<string, number> = {};
const joint: Record<string, number> = {};
for (let age = 55; age <= 95; age++) {
  let s: number;
  if (age <= 65) s = Math.round((5.0 - (65 - age) * 0.2) * 100) / 100; // 55:3.0 → 65:5.0
  else s = Math.min(7.0, Math.round((5.0 + (age - 65) * 0.1) * 100) / 100); // 70:5.5 → cap 7.0
  single[String(age)] = s;
  joint[String(age)] = Math.max(0, Math.round((s - 0.5) * 100) / 100);
}

// CA surrender (9-yr; padded with a year-10 0% so length === surrender.years=10).
const SCHED_CA = [9, 8, 6.9, 5.8, 4.7, 3.6, 2.4, 1.3, 0.1, 0];
const MIN_5K = ["AK", "HI", "MN", "MO", "NJ", "OR", "PA", "TX", "UT", "WA"];
const min_premium_overrides: Record<string, number> = {};
for (const s of MIN_5K) min_premium_overrides[s] = 5000;

const product = {
  name: "Athene Agility 10",
  carrier_name: "Athene Annuity and Life Company",
  carrier_product_name: "Athene Agility 10 (Income & Death Benefit Rider)",
  category: "income" as const,
  archetype: "income-compound-flat" as const,
  engine_preset: "flat-rate-compound-income" as const,
  modifier_flags: ["has_mva", "has_enhanced_income"] as const,
  source: "manual" as const,
  config: {
    bonus: {
      percentage: 55, // 55% income-base bonus (no AV/annuity bonus)
      type: "immediate" as const,
      vesting_years: null,
      vesting_schedule: null,
      anniversary_rate: null,
      anniversary_years: null,
      applies_to: "income_base" as const,
      confidence: "verified" as const,
    },
    surrender: {
      years: 10,
      schedule: [9, 9, 8, 7, 6, 5, 4, 3, 2, 1], // Most States 10-yr
      confidence: "verified" as const,
    },
    fees: { annual_rider_fee: 0, fee_duration: 0, confidence: "verified" as const },
    withdrawals: {
      penalty_free_percent: 10, // 10% of AV or initial premium
      year_1_rule: "same" as const,
      year_1_custom_percent: null,
      cumulative_withdrawal: false, // Agility: Cumulative Withdrawal = No
      cumulative_percent: null,
      confidence: "verified" as const,
    },
    income: {
      roll_up_type: "compound" as const,
      // Performance-linked roll-up: income base grows 200% of credited interest
      // (Agility's "200% of Interest Credits"). Scales with the assumed return.
      roll_up_interest_multiple: 2.0,
      // Agility credits "200% of the DOLLARS credited to the Accumulated Value"
      // — so the base grows by multiple × rate × accountValue, NOT multiple ×
      // rate × base. Verified to the dollar against the illustration (yr2:
      // $465,913 + 2×$79,289 = $624,491). See [[project_david_legacy_build_plan]].
      roll_up_credit_basis: "account_value" as const,
      // Withdrawal-benefit FIA: the benefit base (= enhanced death benefit) draws
      // down pro-rata as income/withdrawals reduce the account value. Verified to
      // the dollar (yr1 income $465k × (1 − 23,250/300,000) = $428,963).
      benefit_base_draws_down: true,
      roll_up_rate: 10, // superseded by roll_up_interest_multiple; fallback only
      roll_up_split_rate: false,
      roll_up_rate_years_1_5: null,
      roll_up_rate_years_6_10: null,
      roll_up_max_years: 30, // "until age 95"; schema caps at 30 (covers any realistic deferral)
      bonus_applies_to: "income_base" as const,
      payout_factors: { single, joint },
      payout_increment_per_year: 0, // "increasing income" during payout NOT modeled (level floor)
      enhanced_income: {
        // Enhanced Income Benefit: care-facility income doubler (NOT available in
        // CA). Stored for documentation; the engine does not apply it.
        included: true,
        multiplier_single: 2,
        multiplier_joint: 2,
        max_years: 10,
        waiting_period: 1,
      },
      confidence: "assumed" as const, // payout factors beyond 70 + roll-up approximation are estimates
    },
    other: {
      mva_applies: true,
      return_of_premium_year: null, // Agility: Return of Premium = No
      min_premium: 10000,
      max_premium: 2000000,
      min_issue_age: 40,
      max_issue_age: 80,
      confidence: "verified" as const,
    },
    state_availability: {
      not_available: ["GU", "NY", "PR", "VI"],
      bonus_overrides: {}, // 55% income-base bonus applies in all available states
      age_overrides: {},
      mva_overrides: {},
      surrender_overrides: { CA: SCHED_CA },
      vesting_overrides: {},
      min_premium_overrides,
      confidence: "verified" as const,
    },
    form_defaults: {
      // ⚠️ RECALIBRATE BEFORE RE-SEEDING THE DB. The old 5.25% was a "benefit-
      // base-equivalent" fudge for the OLD pattern-A roll-up (compound base ×
      // 2×rate). With roll_up_credit_basis 'account_value' (pattern B, the
      // carrier's real mechanic), the assumed rate IS the AV credited rate — so
      // the honest default is the illustration's ~8.35% AV effective, which
      // reproduces benefit base ~$1.205M / income ~$60k. At 5.25% pattern B now
      // yields only ~$860k (under-states the illustration). Left at 5.25% pending
      // David's preferred assumed-rate convention (his open Q3). Advisor sets per
      // client regardless. Guaranteed (0%) gives $465k base / $23,250 either way.
      rate_of_return: 5.25,
    },
  },
};

(async () => {
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) { console.error("listUsers failed:", listErr.message); process.exit(1); }
  const user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) { console.error(`No user found with email: ${email}`); process.exit(1); }

  const row = {
    user_id: user.id,
    name: product.name,
    carrier_name: product.carrier_name,
    carrier_product_name: product.carrier_product_name,
    category: product.category,
    archetype: product.archetype,
    engine_preset: product.engine_preset,
    modifier_flags: product.modifier_flags,
    config: product.config,
    source: product.source,
  };

  const { data: existing } = await admin
    .from("custom_products")
    .select("id")
    .eq("user_id", user.id)
    .eq("name", product.name)
    .maybeSingle();

  if (existing) {
    const { data: upd, error } = await admin.from("custom_products").update(row).eq("id", existing.id).select("id").single();
    if (error) { console.error("Update failed:", error.message); process.exit(1); }
    console.log(`Updated Athene Agility 10 (${upd.id}) for ${email}.`);
  } else {
    const { data: created, error } = await admin.from("custom_products").insert(row).select("id").single();
    if (error) { console.error("Insert failed:", error.message); process.exit(1); }
    console.log(`Created Athene Agility 10 (${created.id}) for ${email}.`);
  }
  console.log("GI FIA | 55% income-base bonus | roll-up 200% of credits | 0 fee | payout 5.0%@65 | default rate 5.0%");
  process.exit(0);
})();
