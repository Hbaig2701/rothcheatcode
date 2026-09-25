/**
 * Seeds a test client "Julian Hutchins (Allianz 222+ test)" linked to the
 * seeded Allianz 222+ product, configured to reproduce the illustration:
 *   $1M IRA, age 75, GA, single, convert 1 yr → buy 222+ → income at 86.
 * Validated annual income ≈ $199K (illustration $199,439).
 *
 * Usage: npx tsx scripts/seed-client-julian-hutchins.ts <email>
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

const email = process.argv[2];
if (!email) { console.error("Usage: npx tsx scripts/seed-client-julian-hutchins.ts <email>"); process.exit(1); }
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const PRODUCT_NAME = "Allianz 222+ Annuity";
const CLIENT_NAME = "Julian Hutchins (Allianz 222+ test)";

(async () => {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) { console.error(`No user: ${email}`); process.exit(1); }

  const { data: product } = await admin.from("custom_products").select("*").eq("user_id", user.id).eq("name", PRODUCT_NAME).maybeSingle();
  if (!product) { console.error(`Product "${PRODUCT_NAME}" not in ${email}'s library — run seed-allianz-222.ts first.`); process.exit(1); }

  const { data: existing } = await admin.from("clients").select("id").eq("user_id", user.id).eq("name", CLIENT_NAME).maybeSingle();

  const clientPayload: Record<string, unknown> = {
    user_id: user.id,
    name: CLIENT_NAME,
    // Product link
    custom_product_id: product.id,
    blueprint_type: product.engine_preset, // flat-rate-compound-income
    carrier_name: product.carrier_name,
    product_name: product.carrier_product_name,

    // Section 1 — Client
    filing_status: "single",
    age: 75,
    date_of_birth: "1951-01-01",
    spouse_name: null, spouse_age: null, spouse_dob: null,

    // Section 2 — Current account
    qualified_account_value: 100_000_000, // $1,000,000

    // Section 3 — Product
    bonus_percent: 45, // Allianz 222 income-base bonus
    rate_of_return: 6,
    anniversary_bonus_percent: null, anniversary_bonus_years: null,

    // Section 4 — Tax
    state: "GA",
    state_tax_rate: 5.39,
    constraint_type: "bracket_ceiling",
    tax_rate: 24,
    max_tax_rate: 37, // 1-year full conversion of $1M hits the top bracket
    tax_payment_source: "from_taxable",
    federal_bracket: "37",
    include_niit: false, include_aca: false,

    // Section 5 — Income (none; mirrors the standalone illustration)
    ssi_payout_age: 67, ssi_annual_amount: 0,
    spouse_ssi_payout_age: null, spouse_ssi_annual_amount: null,
    ss_self: 0, ss_spouse: 0, pension: 0, other_income: 0, ss_start_age: 67,
    non_ssi_income: [], withdrawals: [],

    // Section 6 — Conversion (1-yr convert to fund the GI annuity)
    conversion_type: "optimized_amount",
    fixed_conversion_amount: null, target_partial_amount: null,
    respect_penalty_free_limit: true, penalty_free_scope: "tax_only",
    protect_initial_premium: false,
    years_to_defer_conversion: 0,

    // Section 7 — Roth withdrawals
    withdrawal_type: "no_withdrawals",

    // GI rider
    payout_type: "individual",
    payout_option: "level",
    income_start_age: 86,       // purchase at 76 (after 1 conv yr) + 10-yr wait
    guaranteed_rate_of_return: 6,
    roll_up_option: null,
    gi_conversion_years: 1,     // REQUIRED > 0 — engine funds the annuity from the conversion
    gi_conversion_bracket: 37,

    // Section 8 — Advanced
    surrender_years: 10,
    surrender_schedule: [9.3, 9.3, 8.3, 7.3, 6.25, 5.25, 4.2, 3.15, 2.1, 1.05],
    penalty_free_percent: 10,
    baseline_comparison_rate: 6,
    post_contract_rate: 6,
    end_age: 105,
    heir_tax_rate: 32,
    widow_analysis: false, widow_death_age: null,
    rmd_treatment: "reinvested",
    rmds_handled_externally: false,

    // AUM split — off
    aum_allocation_percent: 0, aum_fee_percent: 1, aum_dividend_yield: 2,
    aum_turnover_percent: 10, aum_withdrawal_years: 5, ltcg_rate: 15,

    // Balances outside the annuity
    roth_ira: 0, taxable_accounts: 0,

    // Legacy/deprecated defaults
    life_expectancy: null, traditional_ira: 0, other_retirement: 0,
    strategy: "moderate", start_age: 75, growth_rate: 6, inflation_rate: 0,
    heir_bracket: "32", projection_years: 30, sensitivity: false,
  };

  if (existing) {
    const { data: u, error } = await admin.from("clients").update(clientPayload).eq("id", existing.id).select("id").single();
    if (error) { console.error("Update failed:", error.message); process.exit(1); }
    console.log(`Updated client ${u.id}`);
    console.log(`View: https://app.retirementexpert.ai/clients/${u.id}/results`);
  } else {
    const { data: c, error } = await admin.from("clients").insert(clientPayload).select("id").single();
    if (error) { console.error("Insert failed:", error.message); process.exit(1); }
    console.log(`Created client ${c.id}`);
    console.log(`View: https://app.retirementexpert.ai/clients/${c.id}/results`);
  }
  process.exit(0);
})();
