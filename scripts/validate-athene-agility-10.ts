/**
 * Validates the Athene Agility 10 build against the carrier illustration
 * (Karen Gervasoni: CA, age 55, $300,000 Traditional IRA, income @65, 55%
 * income-base bonus, 200%-of-credits roll-up).
 *
 *   (A) GUARANTEED (0% credited): income base stays $465,000 → income @65 =
 *       $465,000 × 5.0% = $23,250 (illustration exact).
 *   (B) CURRENT-rates calibration (default 5.0%): income base rolls at 2×5% =
 *       10%/yr for 10 yrs → ~$1.206M → income @65 ≈ $60k (illustration ~$60,359).
 *   (C) Scaling sanity at a few rates.
 *
 * Usage: npx tsx scripts/validate-athene-agility-10.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { runGuaranteedIncomeSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";
import type { CustomProductRow } from "../lib/products/types";

config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const PRODUCT_ID = "287cd15a-08f0-467b-894a-37af0176c36c"; // Hamza master
const usd = (c: number) => "$" + Math.round(c / 100).toLocaleString();

// Karen: issue 55, CA, $300k, income at 65 (10-yr wait). bonus_percent=55 is the
// income-base bonus the picker auto-fills. gi_conversion_years=1 funds the annuity.
function karen(rate: number): Client {
  return {
    name: "Karen (Agility test)", age: 55, date_of_birth: "1971-01-01",
    filing_status: "single", state: "CA",
    qualified_account_value: 30_000_000, // $300,000 in CENTS
    custom_product_id: PRODUCT_ID, blueprint_type: "flat-rate-compound-income",
    rate_of_return: rate, guaranteed_rate_of_return: rate,
    payout_type: "individual", payout_option: "level", roll_up_option: null,
    end_age: 105, projection_years: 45, ss_self: 0, ssi_annual_amount: 0,
    bonus_percent: 55, tax_payment_source: "from_taxable",
    gi_conversion_years: 1, income_start_age: 65,
  } as unknown as Client;
}
const metricsAt = (product: CustomProductRow, rate: number) => {
  const { giMetrics } = runGuaranteedIncomeSimulation(createSimulationInput(karen(rate), product));
  return giMetrics;
};

(async () => {
  const { data: p } = await admin.from("custom_products").select("*").eq("id", PRODUCT_ID).single();
  const product = p as CustomProductRow;
  const inc = product.config.income!;
  console.log(`Product: "${product.name}"  bonus=${product.config.bonus.percentage}%  multiple=${inc.roll_up_interest_multiple}×  payout@65=${inc.payout_factors.single["65"]}%  fee=${product.config.fees.annual_rider_fee}%`);
  console.log();

  console.log("=== (A) GUARANTEED (0% credited) ===");
  const g = metricsAt(product, 0);
  console.log(`  income base @ income age = ${usd(g.incomeBaseAtIncomeAge)}   (illustration $465,000)`);
  console.log(`  annual income (gross)     = ${usd(g.annualIncomeGross)}   (illustration $23,250)`);
  console.log();

  console.log("=== (B) CURRENT-rates default (5.25%) ===");
  const c = metricsAt(product, 5.25);
  console.log(`  income base @ income age = ${usd(c.incomeBaseAtIncomeAge)}   (illustration ~$1,205,473)`);
  console.log(`  annual income (gross)     = ${usd(c.annualIncomeGross)}   (illustration ~$60,359)`);
  console.log();

  console.log("=== (C) scaling at other rates ===");
  for (const r of [0, 3, 5, 7]) {
    const m = metricsAt(product, r);
    console.log(`  @${r}% → income base ${usd(m.incomeBaseAtIncomeAge)} | income ${usd(m.annualIncomeGross)}`);
  }
  process.exit(0);
})();
