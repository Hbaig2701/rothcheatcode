/**
 * Runs the GI engine on a Julian-Hutchins-mirror client using the seeded
 * Allianz 222+ product, and compares to the illustration's numbers.
 * Usage: npx tsx scripts/validate-allianz-222.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { runGuaranteedIncomeSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";
import type { CustomProductRow } from "../lib/products/types";

config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const PRODUCT_ID = "15211c41-9a76-4421-a299-7729f4c83a01";
const usd = (cents: number) => "$" + Math.round(cents / 100).toLocaleString();

(async () => {
  const { data: product } = await admin.from("custom_products").select("*").eq("id", PRODUCT_ID).single();
  if (!product) { console.error("product not found"); process.exit(1); }

  const base = {
    name: "Julian Hutchins (test)",
    age: 75,
    date_of_birth: "1951-01-01",
    filing_status: "single",
    state: "GA",
    qualified_account_value: 100_000_000, // $1,000,000 in cents
    custom_product_id: PRODUCT_ID,
    blueprint_type: product.engine_preset, // flat-rate-compound-income
    rate_of_return: 6,
    guaranteed_rate_of_return: 6,
    payout_type: "individual",
    payout_option: "level",
    roll_up_option: null,
    end_age: 105,
    projection_years: 30,
    ss_self: 0, ssi_annual_amount: 0,
    bonus_percent: 45,
    tax_payment_source: "from_taxable",
  };

  const scenarios = [
    { label: "no conversion (gi_conversion_years=0)", gi_conversion_years: 0, income_start_age: 85 },
    { label: "convert-then-buy (1 yr), income@86 (defer 10)", gi_conversion_years: 1, income_start_age: 86 },
    { label: "convert-then-buy (1 yr), income@85 (defer 9)", gi_conversion_years: 1, income_start_age: 85 },
  ];

  console.log("ILLUSTRATION target (year 10 / age 85, current ~6%): income base $3,323,992 → income $199,439 (6%)");
  console.log("Guaranteed (0%): income base $876,727 → income $52,604\n");

  for (const s of scenarios) {
    const client = { ...base, ...s } as unknown as Client;
    const input = createSimulationInput(client, product as CustomProductRow);
    const { giMetrics: g } = runGuaranteedIncomeSimulation(input);
    const diff = g.annualIncomeGross > 0 ? ((g.annualIncomeGross / 100 - 199439) / 199439) * 100 : -100;
    console.log(`--- ${s.label} ---`);
    console.log(`  income start age ${g.incomeStartAge} | deferral ${g.deferralYears} yrs`);
    console.log(`  income base @ start: ${usd(g.incomeBaseAtStart)} | @ income age: ${usd(g.incomeBaseAtIncomeAge)}`);
    console.log(`  payout ${g.payoutPercent}% | ANNUAL INCOME ${usd(g.annualIncomeGross)}  (vs illus $199,439 → ${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%)\n`);
  }
})();
