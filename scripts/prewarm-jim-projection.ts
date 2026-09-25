import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import crypto from "crypto";
import { runGrowthSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";
config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const PRODUCT_CONFIG_VERSION = 75;
const bi = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;

// EXACT copy of generateInputHash's relevantFields ordering from the route.
function generateInputHash(client: any, customProduct: any): string {
  const relevantFields = {
    _configVersion: PRODUCT_CONFIG_VERSION,
    custom_product_id: client.custom_product_id ?? null,
    custom_product_config: customProduct?.config ?? null,
    custom_product_engine_preset: customProduct?.engine_preset ?? null,
    custom_product_updated_at: customProduct?.updated_at ?? null,
    age: client.age,
    qualified_account_value: client.qualified_account_value,
    carrier_name: client.carrier_name,
    product_name: client.product_name,
    bonus_percent: client.bonus_percent,
    rate_of_return: client.rate_of_return,
    anniversary_bonus_percent: client.anniversary_bonus_percent,
    anniversary_bonus_years: client.anniversary_bonus_years,
    constraint_type: client.constraint_type,
    target_irmaa_tier: client.target_irmaa_tier,
    tax_rate: client.tax_rate,
    max_tax_rate: client.max_tax_rate,
    ssi_payout_age: client.ssi_payout_age,
    ssi_annual_amount: client.ssi_annual_amount,
    spouse_age: client.spouse_age,
    spouse_ssi_payout_age: client.spouse_ssi_payout_age,
    spouse_ssi_annual_amount: client.spouse_ssi_annual_amount,
    non_ssi_income: client.non_ssi_income,
    withdrawals: client.withdrawals,
    conversion_type: client.conversion_type,
    fixed_conversion_amount: client.fixed_conversion_amount,
    target_partial_amount: client.target_partial_amount,
    respect_penalty_free_limit: client.respect_penalty_free_limit,
    penalty_free_scope: client.penalty_free_scope,
    protect_initial_premium: client.protect_initial_premium,
    withdrawal_type: client.withdrawal_type,
    surrender_years: client.surrender_years,
    surrender_schedule: client.surrender_schedule,
    penalty_free_percent: client.penalty_free_percent,
    baseline_comparison_rate: client.baseline_comparison_rate,
    post_contract_rate: client.post_contract_rate,
    years_to_defer_conversion: client.years_to_defer_conversion,
    heir_tax_rate: client.heir_tax_rate,
    rmd_treatment: client.rmd_treatment,
    rmds_handled_externally: client.rmds_handled_externally,
    held_back_ira_balance: client.held_back_ira_balance ?? null,
    held_back_ira_growth_rate: client.held_back_ira_growth_rate ?? null,
    widow_death_age: client.widow_death_age,
    tax_payment_source: client.tax_payment_source,
    state_tax_rate: client.state_tax_rate,
    gross_taxable_non_ssi: client.gross_taxable_non_ssi,
    tax_exempt_non_ssi: client.tax_exempt_non_ssi,
    additional_deductions: client.additional_deductions,
    tax_credits: client.tax_credits,
    traditional_ira: client.traditional_ira,
    roth_ira: client.roth_ira,
    taxable_accounts: client.taxable_accounts,
    date_of_birth: client.date_of_birth,
    spouse_dob: client.spouse_dob,
    filing_status: client.filing_status,
    state: client.state,
    strategy: client.strategy,
    start_age: client.start_age,
    end_age: client.end_age,
    growth_rate: client.growth_rate,
    inflation_rate: client.inflation_rate,
    projection_years: client.projection_years,
    ss_self: client.ss_self,
    ss_spouse: client.ss_spouse,
    pension: client.pension,
    other_income: client.other_income,
    widow_analysis: client.widow_analysis,
    include_niit: client.include_niit,
    blueprint_type: client.blueprint_type,
    payout_type: client.payout_type,
    income_start_age: client.income_start_age,
    guaranteed_rate_of_return: client.guaranteed_rate_of_return,
    roll_up_option: client.roll_up_option,
    payout_option: client.payout_option,
    gi_conversion_years: client.gi_conversion_years,
    gi_conversion_bracket: client.gi_conversion_bracket,
    gi_legacy_mode: client.gi_legacy_mode,
    aum_allocation_percent: client.aum_allocation_percent,
    aum_fee_percent: client.aum_fee_percent,
    aum_dividend_yield: client.aum_dividend_yield,
    aum_turnover_percent: client.aum_turnover_percent,
    aum_withdrawal_years: client.aum_withdrawal_years,
    aum_growth_rate: client.aum_growth_rate,
    ltcg_rate: client.ltcg_rate,
  };
  return crypto.createHash("sha256").update(JSON.stringify(relevantFields)).digest("hex");
}

async function prewarm(clientId: string) {
  const { data: rows } = await admin.from("clients").select("*").eq("id", clientId);
  const c = (rows as Client[])?.[0];
  if (!c) { console.log(`  client ${clientId} not found`); return; }
  const { data: cpRows } = await admin.from("custom_products").select("*").eq("id", c.custom_product_id);
  const customProduct = (cpRows as any[])?.[0] ?? null;

  const hash = generateInputHash(c, customProduct);

  // Skip if a matching cached row already exists (idempotent).
  const { data: existing } = await admin.from("projections").select("id").eq("client_id", clientId).eq("input_hash", hash).limit(1);
  if (existing?.length) { console.log(`  ${c.name}: already cached (${(existing[0] as any).id}) — skipping`); return; }

  const res = runGrowthSimulation(createSimulationInput(c, customProduct));
  const lb = res.baseline[res.baseline.length - 1];
  const lf = res.formula[res.formula.length - 1];
  const strategyMap: Record<string, string> = { optimized_amount: "moderate" };
  const projectionYears = c.age && (c as any).end_age ? (c as any).end_age - c.age : ((c as any).projection_years ?? 30);

  const row: any = {
    client_id: clientId,
    user_id: c.user_id,
    input_hash: hash,
    break_even_age: bi(res.breakEvenAge),
    total_tax_savings: bi(res.totalTaxSavings),
    heir_benefit: bi(res.heirBenefit),
    baseline_final_traditional: bi(lb.traditionalBalance),
    baseline_final_roth: bi(lb.rothBalance),
    baseline_final_taxable: bi(lb.taxableBalance),
    baseline_final_net_worth: bi(lb.netWorth),
    blueprint_final_traditional: bi(lf.traditionalBalance),
    blueprint_final_roth: bi(lf.rothBalance),
    blueprint_final_taxable: bi(lf.taxableBalance),
    blueprint_final_net_worth: bi(lf.netWorth),
    baseline_years: res.baseline,
    blueprint_years: res.formula,
    strategy: c.conversion_type === "optimized_amount" ? "moderate" : ((c as any).strategy ?? "moderate"),
    projection_years: projectionYears,
  };

  const { data: ins, error } = await admin.from("projections").insert(row).select("id").single();
  if (error) { console.log(`  ${c.name}: INSERT FAILED`, JSON.stringify(error)); return; }
  console.log(`  ${c.name}: ✅ pre-warmed projection id=${ins.id} hash=${hash.slice(0, 12)}…`);
}

(async () => {
  console.log("Pre-warming projections:");
  await prewarm("01a58058-161c-4da9-8fbb-e3220d7bcb9f"); // original Jim Bonadio
  await prewarm("a26e3af6-0345-4555-89c2-5f834783e5b0"); // Jim Bonadio (Copy)
})();
