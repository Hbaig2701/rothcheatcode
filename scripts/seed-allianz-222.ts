/**
 * One-shot admin script to seed the Allianz 222+ Annuity (with the Protected
 * Income Value / Lifetime Income rider) into a user's product library.
 *
 * Usage:  npx tsx scripts/seed-allianz-222.ts <email>
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
 *
 * Source: "Growth and RMDs - Allianz 222- Julian Hutchins (1).pdf" (David Abreu,
 *          Pacific United Financial — support ticket 4539ad3d).
 *
 * MODELING NOTES / APPROXIMATIONS (the reason this can't be self-served):
 *  - The 222+ income base rolls up at "150% of the credited interest rate" —
 *    a PERFORMANCE-DRIVEN roll-up. The platform only models fixed simple/
 *    compound roll-ups, so we approximate: at the illustration's ~6% current
 *    rate, 150% × 6% ≈ 9%/yr; CALIBRATED to 8% to match the illustration's
 *    the illustration after first review — bump roll_up_rate up/down until the
 *    income base + lifetime withdrawal line up.)
 *  - 45% income-base bonus applies to the PIV only (no account-value bonus).
 *  - Payout factors from the illustration's "Lifetime Withdrawal Rate" column:
 *    5.5% ages 75-78, 6.0% age 79+. Younger ages ramped (estimate).
 *  - 10-year income wait is a CLIENT setting (income_start_age = 85 for a
 *    75-year-old), not a product field.
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const email = process.argv[2];
if (!email) {
  console.error("Usage: npx tsx scripts/seed-allianz-222.ts <email>");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// Payout factors (single %) — anchored to the illustration: 5.5% @75-78, 6.0% @79+.
const single: Record<string, number> = {};
const joint: Record<string, number> = {};
for (let age = 60; age <= 90; age++) {
  let s: number;
  if (age <= 74) s = Math.round((4.6 + (age - 60) * 0.064) * 100) / 100; // ramp ~4.6→5.5
  else if (age <= 78) s = 5.5;
  else s = 6.0;
  single[String(age)] = s;
  joint[String(age)] = Math.round((s - 0.5) * 100) / 100;
}

const product = {
  name: "Allianz 222+ Annuity",
  carrier_name: "Allianz Life Insurance Company of North America",
  carrier_product_name: "Allianz 222+ Annuity (Protected Income Value rider)",
  category: "income" as const,
  archetype: "income-compound-flat" as const,
  engine_preset: "flat-rate-compound-income" as const,
  modifier_flags: ["has_mva", "has_enhanced_income"] as const,
  source: "manual" as const,
  config: {
    bonus: {
      percentage: 45, // 45% income-base bonus (PERCENT units)
      type: "immediate" as const,
      vesting_years: null,
      vesting_schedule: null,
      anniversary_rate: null,
      anniversary_years: null,
      applies_to: "income_base" as const,
      confidence: "estimated" as const,
    },
    surrender: {
      years: 10,
      schedule: [9.3, 9.3, 8.3, 7.3, 6.25, 5.25, 4.2, 3.15, 2.1, 1.05],
      confidence: "verified" as const,
    },
    fees: { annual_rider_fee: 0, fee_duration: 0, confidence: "verified" as const },
    withdrawals: {
      penalty_free_percent: 10,
      year_1_rule: "same" as const,
      year_1_custom_percent: null,
      cumulative_withdrawal: true, // enhanced penalty-free carryover up to 20%
      cumulative_percent: 20,
      confidence: "estimated" as const,
    },
    income: {
      roll_up_type: "compound" as const,
      // Performance-linked roll-up: income base grows 150% of credited interest
      // each year (the 222's true rider spec). Scales with the assumed return.
      // The default return (form_defaults below) is set to the illustration's
      // effective credited rate so the out-of-box result matches the carrier.
      roll_up_interest_multiple: 1.5,
      roll_up_rate: 8, // superseded by roll_up_interest_multiple; kept as a fallback
      roll_up_split_rate: false,
      roll_up_rate_years_1_5: null,
      roll_up_rate_years_6_10: null,
      roll_up_max_years: 20, // rolls up to age 95 (issue age 75)
      // 222 roll-up is "150% of the interest RATE" on the PIV → keep the default
      // 'income_base' credit basis (pattern A), which matches the illustration
      // (NOT the dollars-to-AV basis the Athene Agility uses).
      // Withdrawal-benefit FIA: PIV (= enhanced death benefit) draws down
      // pro-rata as withdrawals reduce the accumulation value. Verified to the
      // dollar (yr3 $100k/$1M=10% → PIV $1,450,000 × 0.90 = $1,305,000).
      benefit_base_draws_down: true,
      bonus_applies_to: "income_base" as const,
      payout_factors: { single, joint },
      payout_increment_per_year: 0, // illustration shows flat 6% past age 79
      enhanced_income: {
        // Allianz Income Multiplier (AIM): doubles income if confined to a
        // qualifying care facility / unable to do 2 of 6 ADLs.
        included: true,
        multiplier_single: 2,
        multiplier_joint: 2,
        max_years: 5,
        waiting_period: 1,
      },
      confidence: "estimated" as const,
    },
    other: {
      mva_applies: true,
      return_of_premium_year: null,
      min_premium: 20000,
      max_premium: 2000000,
      min_issue_age: 0,
      max_issue_age: 80,
      confidence: "estimated" as const,
    },
    state_availability: {
      not_available: ["GU", "NY", "OR", "PR", "VI"],
      bonus_overrides: {},
      age_overrides: {},
      mva_overrides: {},
      surrender_overrides: {},
      vesting_overrides: {},
      min_premium_overrides: {},
      confidence: "verified" as const,
    },
    form_defaults: {
      // Illustration's effective credited rate (~5.4%). At 150% of this the
      // income base rolls up ~8.1%/yr, reproducing the illustration income
      // (~$199k). Advisors can raise/lower this; the roll-up scales with it.
      rate_of_return: 5.4,
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
    console.log(`Updated Allianz 222+ (${upd.id}) for ${email}.`);
  } else {
    const { data: created, error } = await admin.from("custom_products").insert(row).select("id").single();
    if (error) { console.error("Insert failed:", error.message); process.exit(1); }
    console.log(`Created Allianz 222+ (${created.id}) for ${email}.`);
  }
  console.log("Roll-up: 150% of credited interest (scales) | default rate 5.4% | bonus 45% | payout 5.5%@75-78, 6%@79+");
  process.exit(0);
})();
