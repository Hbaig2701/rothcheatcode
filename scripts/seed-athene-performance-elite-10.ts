/**
 * One-shot admin script to seed the Athene Performance Elite 10 Plus
 * (a single-premium fixed-INDEXED ACCUMULATION annuity — NOT a guaranteed-
 * income product) into a user's product library.
 *
 * Usage:  npx tsx scripts/seed-athene-performance-elite-10.ts <email>
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
 *
 * Source: David Abreu (Pacific United Financial) illustration + profile —
 *   "Athene Performance Elite 10 Plus", prepared for Karen Gervasoni, CA,
 *   age 55, $300,000 Traditional IRA, 20% premium bonus, 06/16/2026.
 *
 * WHY THIS IS A CURATED BUILD (not self-served):
 *  - This is an ACCUMULATION FIA. It plugs into the GROWTH engine (Roth-
 *    conversion strategy vs traditional-IRA-with-RMDs baseline), modeled as a
 *    flat assumed crediting rate. The platform has no caps/participation-rate
 *    mechanics, so the index strategies (NASDAQ FC PTP, etc.) collapse to a
 *    single assumed `rate_of_return` the advisor sets per client.
 *  - The 20% premium bonus is a VESTING bonus (10-yr vest). The growth engine
 *    credits the full bonus to the accumulation value at issue and does NOT
 *    model vesting forfeiture on early surrender — standard simplification for
 *    all bonus FIAs on the platform.
 *  - Heavy STATE variation: premium bonus and surrender schedule differ by
 *    state and issue-age band. Captured in state_availability overrides, which
 *    the new-account form auto-applies to bonus_percent / surrender_schedule
 *    when the client's state matches. Age-band bonus reductions (e.g. CA 20%
 *    @<=70 / 19% @71-75 / 17% @76+) can't be encoded per-state, so the <=70
 *    band is used and the advisor adjusts bonus_percent per client.
 *
 * MODELING NOTES / APPROXIMATIONS:
 *  - BASE (headline) = "Most States": 26% premium bonus, 10-yr surrender
 *    [12,12,12,11,10,9,8,7,6,4]. CA (David's state, and the Karen illustration)
 *    is 20% with the [8.2..0.1] schedule — applied via the CA override.
 *  - 0.95% Athene Annual Liquidity Rider charge, deducted during the 10-yr
 *    surrender/rider-charge period (fee_duration = surrender_period).
 *  - Return of Premium starting year 5 (after the 4th contract year).
 *  - MVA applies (negative/positive on excess withdrawals); MO & MD are
 *    "Without MVA" per the variations table.
 *  - Not available: GU, NY, PR, VI. $5,000 min in CT/ID/MN/NJ/OH/OR/PA/UT/WA.
 *  - form_defaults.rate_of_return = 6.5%: a moderate FIA crediting assumption.
 *    The carrier illustration's hypothetical "current rates" effective rate is
 *    8.35% (optimistic, NASDAQ-heavy backtest); guaranteed is ~0%. The advisor
 *    sets this per client; the projection scales with it.
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const email = process.argv[2];
if (!email) {
  console.error("Usage: npx tsx scripts/seed-athene-performance-elite-10.ts <email>");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// State groups for surrender-schedule overrides (10-yr, padded so length === 10).
const SCHED_85 = [8.3, 8, 7.1, 6.2, 5.3, 4.4, 3.5, 2.6, 1.6, 0.9]; // AK CT DE ID LA MN NV NJ OH OK OR PA UT WA, SC, TX
const SCHED_CA = [8.2, 7.7, 6.6, 5.6, 4.5, 3.4, 2.3, 1.2, 0.1, 0]; // CA (genuinely 9-yr; yr10 = 0%)
const SCHED_FLMD = [10, 10, 10, 10, 9, 8, 7, 6, 5, 4]; // FL, MD
const GROUP_85 = ["AK", "CT", "DE", "ID", "LA", "MN", "NV", "NJ", "OH", "OK", "OR", "PA", "UT", "WA", "SC", "TX"];
const surrender_overrides: Record<string, number[]> = { CA: SCHED_CA, FL: SCHED_FLMD, MD: SCHED_FLMD };
for (const s of GROUP_85) surrender_overrides[s] = SCHED_85;

const MIN_5K = ["CT", "ID", "MN", "NJ", "OH", "OR", "PA", "UT", "WA"];
const min_premium_overrides: Record<string, number> = {};
for (const s of MIN_5K) min_premium_overrides[s] = 5000;

// Premium-bonus by state at issue age <=70 (Variations table). BASE = 26% for
// the large alphabetical group (AL AZ AR CO DC GA HI IL IN IA KS KY ME MA MI MS
// MT NE NH NM NC ND RI SD TN VT VA WV WI WY + MO). These states get 24%; CA gets
// 20%. (Age 71-75 / 76+ buyers get ~2pts less per band — not encodable per-state;
// advisor adjusts bonus_percent per client. The validated Karen illustration is
// CA age 55, i.e. the <=70 band.)
const BONUS_24 = ["AK", "CT", "DE", "ID", "LA", "MN", "NV", "NJ", "OH", "OK", "OR", "PA", "UT", "WA", "SC", "TX", "MD", "FL"];
const bonus_overrides: Record<string, number> = { CA: 20 };
for (const s of BONUS_24) bonus_overrides[s] = 24;

const product = {
  name: "Athene Performance Elite 10 Plus",
  carrier_name: "Athene Annuity and Life Company",
  carrier_product_name: "Athene Performance Elite 10 Plus",
  category: "growth" as const,
  archetype: "growth-vesting" as const,
  engine_preset: "vesting-bonus-growth" as const,
  modifier_flags: ["has_mva", "has_return_of_premium", "has_annual_fee"] as const,
  source: "manual" as const,
  config: {
    bonus: {
      percentage: 26, // BASE = Most States; CA override = 20 (see state_availability)
      type: "vesting" as const,
      vesting_years: 10,
      vesting_schedule: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100], // descriptive only — engine credits full bonus at issue
      anniversary_rate: null,
      anniversary_years: null,
      applies_to: "account_value" as const,
      confidence: "verified" as const,
    },
    surrender: {
      years: 10,
      schedule: [12, 12, 12, 11, 10, 9, 8, 7, 6, 4], // Most States 10-yr
      confidence: "verified" as const,
    },
    fees: {
      annual_rider_fee: 0.95, // Athene Annual Liquidity Rider, deducted during the rider-charge period
      fee_duration: "surrender_period" as const,
      confidence: "verified" as const,
    },
    withdrawals: {
      penalty_free_percent: 10, // Performance Elite 10: 10%/yr, available year 1
      year_1_rule: "same" as const,
      year_1_custom_percent: null,
      cumulative_withdrawal: true, // up to 20% next year if none taken
      cumulative_percent: 20,
      confidence: "verified" as const,
    },
    income: null, // accumulation product — no lifetime income rider
    other: {
      mva_applies: true,
      return_of_premium_year: 5, // ROP after the 4th contract year
      min_premium: 10000,
      max_premium: 2000000,
      min_issue_age: 0,
      max_issue_age: 78,
      confidence: "verified" as const,
    },
    state_availability: {
      not_available: ["GU", "NY", "PR", "VI"],
      // Premium-bonus overrides (issue age <=70 band) — see BONUS_24 above.
      bonus_overrides,
      age_overrides: {}, // max issue age is 78 in all available states
      mva_overrides: { MO: false, MD: false }, // "Without MVA" per variations table
      surrender_overrides,
      vesting_overrides: {},
      min_premium_overrides,
      confidence: "verified" as const,
    },
    form_defaults: {
      rate_of_return: 6.5, // moderate FIA assumption (illustration current-rates effective = 8.35%, guaranteed = ~0%)
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
    console.log(`Updated Athene Performance Elite 10 Plus (${upd.id}) for ${email}.`);
  } else {
    const { data: created, error } = await admin.from("custom_products").insert(row).select("id").single();
    if (error) { console.error("Insert failed:", error.message); process.exit(1); }
    console.log(`Created Athene Performance Elite 10 Plus (${created.id}) for ${email}.`);
  }
  console.log("Growth FIA | base 26% bonus (CA 20%) | 0.95% rider fee | ROP yr5 | MVA | default rate 6.5%");
  process.exit(0);
})();
