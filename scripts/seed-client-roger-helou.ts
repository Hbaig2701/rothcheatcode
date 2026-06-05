/**
 * One-shot admin script to seed a test client mirroring Roger Helou,
 * the client from Michael's case. Links to the ANICO Strategy Indexed
 * Annuity PLUS 10 custom product (must be seeded first).
 *
 * Usage:
 *   npx tsx scripts/seed-client-roger-helou.ts <email>
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
 *
 * Source data (from Michael's intake email):
 *   Roger Helou DOB 7/1/55 (age 70) — Spouse Sherri, age 66
 *   Florida, MFJ
 *   SS Roger: $42,000/yr; SS Sherri: $20,000/yr
 *   Rollover IRA: $2,276,000
 *   Fidelity Roth IRA: $117,972
 *   Brokerage (drawing from): $309,000
 *   Goals: minimize taxes, minimize RMDs, kids inherit remainder
 *   Withdrew $37K this year w/ no tax impact (LTCG basis recovery — informational)
 *
 * Product used: ANICO Strategy Indexed Annuity PLUS 10 (growth-only variant).
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const email = process.argv[2];
if (!email) {
  console.error("Usage: npx tsx scripts/seed-client-roger-helou.ts <email>");
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

const PRODUCT_NAME = "ANICO Strategy Indexed Annuity PLUS 10";
const CLIENT_NAME = "Roger Helou (test mirror)";

(async () => {
  // 1. Look up the user
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

  // 2. Look up the ANICO product in their library
  const { data: product, error: prodErr } = await admin
    .from("custom_products")
    .select("id, engine_preset, name, carrier_name, carrier_product_name")
    .eq("user_id", user.id)
    .eq("name", PRODUCT_NAME)
    .maybeSingle();

  if (prodErr) {
    console.error("Failed to look up product:", prodErr.message);
    process.exit(1);
  }
  if (!product) {
    console.error(
      `Product "${PRODUCT_NAME}" not found in ${email}'s library. ` +
        `Run scripts/seed-anico-strategy-index-10.ts first.`
    );
    process.exit(1);
  }

  // 3. Check for existing client of this name
  const { data: existing } = await admin
    .from("clients")
    .select("id")
    .eq("user_id", user.id)
    .eq("name", CLIENT_NAME)
    .maybeSingle();

  // 4. Build client payload — dollars in CENTS throughout
  const clientPayload = {
    user_id: user.id,

    // Product link
    custom_product_id: product.id,
    blueprint_type: product.engine_preset, // "high-bonus-long-term-growth"

    // Section 1 — Client Data
    filing_status: "married_filing_jointly",
    name: CLIENT_NAME,
    age: 70,
    spouse_name: "Sherri",
    spouse_age: 66,

    // Section 2 — Current Account
    qualified_account_value: 227_600_000, // $2,276,000

    // Section 3 — Product (mirrors the custom product config)
    carrier_name: product.carrier_name ?? "American National Insurance Company",
    product_name: product.carrier_product_name ?? PRODUCT_NAME,
    bonus_percent: 1,
    rate_of_return: 7.5, // Matches the illustration's terminal compound rate (7.51%)
    anniversary_bonus_percent: null,
    anniversary_bonus_years: null,

    // Section 4 — Tax
    state: "FL",
    constraint_type: "bracket_ceiling",
    tax_rate: 22,
    max_tax_rate: 24,
    tax_payment_source: "from_taxable", // He has $309K brokerage to pay conversion taxes
    state_tax_rate: 0, // Florida — no state income tax

    // Section 5 — Income
    ssi_payout_age: 67, // assumed FRA — he's 70 so already collecting
    ssi_annual_amount: 4_200_000, // $42,000
    spouse_ssi_payout_age: 66, // Sherri's current age, already collecting
    spouse_ssi_annual_amount: 2_000_000, // $20,000
    non_ssi_income: [],
    withdrawals: [],

    // Section 6 — Conversion
    conversion_type: "optimized_amount", // goal: minimize taxes/RMDs — let engine optimize
    fixed_conversion_amount: null,
    target_partial_amount: null,
    respect_penalty_free_limit: false,
    protect_initial_premium: false,

    // Section 7 — Roth withdrawals
    withdrawal_type: "no_withdrawals", // legacy goes through, kids inherit

    // GI-specific (not used for growth product, but schema requires defaults)
    payout_type: "individual",
    income_start_age: 70,
    guaranteed_rate_of_return: 0,
    roll_up_option: null,
    payout_option: null,
    gi_conversion_years: 5,
    gi_conversion_bracket: 24,

    // Section 8 — Advanced
    surrender_years: 10,
    surrender_schedule: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
    penalty_free_percent: 10,
    baseline_comparison_rate: 7.5, // MUST match rate_of_return for fair comparison
    post_contract_rate: 7.5,
    years_to_defer_conversion: 0,
    end_age: 100, // Match the carrier illustration's 30-year horizon (age 70 + 30 = 100)
    heir_tax_rate: 32, // Conservative heir bracket
    widow_analysis: true, // Wife is 4 yrs younger — surviving-spouse single-filer impact matters
    widow_death_age: null, // Let engine use heuristic
    rmd_treatment: "reinvested", // RMDs go into taxable, not spent

    // AUM split — off
    aum_allocation_percent: 0,
    aum_fee_percent: 1,
    aum_dividend_yield: 2,
    aum_turnover_percent: 10,
    aum_withdrawal_years: 5,
    ltcg_rate: 15,

    // Roth + Taxable balances (used outside the IRA engine)
    roth_ira: 11_797_200, // $117,972 — Fidelity Roth
    taxable_accounts: 30_900_000, // $309,000 — brokerage

    // Legacy/deprecated defaults
    date_of_birth: "1955-07-01",
    spouse_dob: null,
    life_expectancy: null,
    traditional_ira: 0,
    other_retirement: 0,
    federal_bracket: "auto",
    include_niit: false,
    include_aca: false,
    ss_self: 4_200_000,
    ss_spouse: 2_000_000,
    pension: 0,
    other_income: 0,
    ss_start_age: 67,
    strategy: "moderate",
    start_age: 70,
    growth_rate: 0,
    inflation_rate: 0,
    heir_bracket: "32",
    projection_years: 30, // 100 - 70, matches illustration horizon
    sensitivity: false,
  };

  if (existing) {
    console.log(`Client already exists (id: ${existing.id}). Updating…`);
    const { data: updated, error: updErr } = await admin
      .from("clients")
      .update(clientPayload)
      .eq("id", existing.id)
      .select()
      .single();
    if (updErr) {
      console.error("Update failed:", updErr.message);
      process.exit(1);
    }
    console.log(`Updated client ${updated.id} for ${email}.`);
    console.log(`View at: https://app.retirementexpert.ai/clients/${updated.id}/results`);
    process.exit(0);
  }

  const { data: created, error: insErr } = await admin
    .from("clients")
    .insert(clientPayload)
    .select()
    .single();

  if (insErr) {
    console.error("Insert failed:", insErr.message);
    process.exit(1);
  }
  console.log(`Created client ${created.id} for ${email}.`);
  console.log(`View at: https://app.retirementexpert.ai/clients/${created.id}/results`);
  process.exit(0);
})();
