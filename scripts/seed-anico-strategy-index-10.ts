/**
 * One-shot admin script to seed the ANICO Strategy Indexed Annuity PLUS 10
 * (growth-only variant) into a user's library.
 *
 * Usage:
 *   npx tsx scripts/seed-anico-strategy-index-10.ts <email>
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
 *
 * Source documents:
 *   - Illustration: "Roger Helou 2.276 MM American National Annuity 10.pdf"
 *   - Brochure:     "American National Strategy Indexed Annuity Plus 10 (1).pdf"
 *
 * What this seeds: the GROWTH-ONLY variant (no Lifetime Income Rider).
 * For income variants, run separately with --include-lir flag (not yet built).
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const email = process.argv[2];
if (!email) {
  console.error("Usage: npx tsx scripts/seed-anico-strategy-index-10.ts <email>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const product = {
  name: "ANICO Strategy Indexed Annuity PLUS 10",
  carrier_name: "American National Insurance Company",
  carrier_product_name: "ANICO Strategy Indexed Annuity PLUS 10 (Strategy Index 10)",
  category: "growth" as const,
  archetype: "growth-immediate" as const,
  modifier_flags: ["has_mva"] as const,
  source: "manual" as const,
  config: {
    bonus: {
      percentage: 1.0,
      type: "immediate" as const,
      vesting_years: null,
      vesting_schedule: null,
      anniversary_rate: null,
      anniversary_years: 7,
      applies_to: "account_value" as const,
      confidence: "verified" as const,
    },
    surrender: {
      years: 10,
      schedule: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
      confidence: "verified" as const,
    },
    fees: {
      annual_rider_fee: 0,
      fee_duration: 0,
      confidence: "verified" as const,
    },
    withdrawals: {
      penalty_free_percent: 10,
      year_1_rule: "same" as const,
      year_1_custom_percent: null,
      cumulative_withdrawal: false,
      cumulative_percent: null,
      confidence: "verified" as const,
    },
    income: null,
    other: {
      mva_applies: true,
      return_of_premium_year: null,
      min_premium: 10000,
      max_premium: null,
      min_issue_age: 0,
      max_issue_age: 80,
      confidence: "verified" as const,
    },
    state_availability: {
      not_available: ["OR"],
      bonus_overrides: {},
      age_overrides: {},
      mva_overrides: {},
      surrender_overrides: {
        CA: [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
      },
      vesting_overrides: {},
      min_premium_overrides: {},
      confidence: "verified" as const,
    },
    form_defaults: {
      rate_of_return: 8.0,
    },
  },
};

(async () => {
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) {
    console.error("Failed to list users:", listErr.message);
    process.exit(1);
  }
  const user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  const { data: existing } = await admin
    .from("custom_products")
    .select("id, name")
    .eq("user_id", user.id)
    .eq("name", product.name)
    .maybeSingle();

  if (existing) {
    console.log(`Product already exists in ${email}'s library (id: ${existing.id}). Updating config…`);
    const { data: updated, error: updErr } = await admin
      .from("custom_products")
      .update({
        carrier_name: product.carrier_name,
        carrier_product_name: product.carrier_product_name,
        category: product.category,
        archetype: product.archetype,
        engine_preset: "high-bonus-long-term-growth",
        modifier_flags: product.modifier_flags,
        config: product.config,
        source: product.source,
      })
      .eq("id", existing.id)
      .select()
      .single();
    if (updErr) {
      console.error("Update failed:", updErr.message);
      process.exit(1);
    }
    console.log(`Updated product ${updated.id} for ${email}.`);
    process.exit(0);
  }

  const { data: created, error: insErr } = await admin
    .from("custom_products")
    .insert({
      user_id: user.id,
      name: product.name,
      carrier_name: product.carrier_name,
      carrier_product_name: product.carrier_product_name,
      category: product.category,
      archetype: product.archetype,
      engine_preset: "high-bonus-long-term-growth",
      modifier_flags: product.modifier_flags,
      config: product.config,
      source: product.source,
    })
    .select()
    .single();

  if (insErr) {
    console.error("Insert failed:", insErr.message);
    process.exit(1);
  }
  console.log(`Created product ${created.id} for ${email}.`);
  process.exit(0);
})();
