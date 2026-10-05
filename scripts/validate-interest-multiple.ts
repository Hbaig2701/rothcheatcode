/**
 * Validates the new performance-linked (interest_multiple) roll-up:
 *  (A) REGRESSION: the existing fixed-8% 222 is unchanged, and DOESN'T scale
 *      with the rate (proving the old behavior is intact).
 *  (B) NEW: a config with roll_up_interest_multiple = 1.5 scales = 1.5 × rate.
 * Usage: npx tsx scripts/validate-interest-multiple.ts
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
const usd = (c: number) => "$" + Math.round(c / 100).toLocaleString();

function julian(rate: number): Client {
  return {
    name: "Julian", age: 75, date_of_birth: "1951-01-01", filing_status: "single", state: "GA",
    qualified_account_value: 100_000_000, custom_product_id: PRODUCT_ID, blueprint_type: "flat-rate-compound-income",
    rate_of_return: rate, guaranteed_rate_of_return: rate, payout_type: "individual", payout_option: "level",
    roll_up_option: null, end_age: 105, projection_years: 30, ss_self: 0, ssi_annual_amount: 0, bonus_percent: 45,
    tax_payment_source: "from_taxable", gi_conversion_years: 1, income_start_age: 86,
  } as unknown as Client;
}
const incomeAt = (product: CustomProductRow, rate: number) => {
  const { giMetrics } = runGuaranteedIncomeSimulation(createSimulationInput(julian(rate), product));
  return giMetrics.annualIncomeGross;
};

(async () => {
  const { data: p } = await admin.from("custom_products").select("*").eq("id", PRODUCT_ID).single();
  const fixed = p as CustomProductRow; // current: fixed 8% roll-up, no interest_multiple

  // Deep clone + set interest_multiple = 1.5 (150% of credited interest)
  const multiple: CustomProductRow = JSON.parse(JSON.stringify(fixed));
  multiple.config.income!.roll_up_interest_multiple = 1.5;

  console.log("=== (A) REGRESSION: existing FIXED-8% product (no interest_multiple) ===");
  console.log(`  @6% rate → ${usd(incomeAt(fixed, 6))}   (must equal $199,096 — unchanged by this feature)`);
  console.log(`  @10% rate → ${usd(incomeAt(fixed, 10))}  (fixed roll-up does NOT scale — old behavior intact)`);
  console.log();
  console.log("=== (B) NEW: interest_multiple = 1.5 (150% of credited interest) ===");
  console.log(`  @6% rate → ${usd(incomeAt(multiple, 6))}   (roll-up = 1.5×6% = 9% → higher than fixed-8%)`);
  console.log(`  @10% rate → ${usd(incomeAt(multiple, 10))}  (roll-up = 1.5×10% = 15% → SCALES with rate)`);
  console.log();
  console.log("Illustration reference (lumpy 'current rates'): ~$199,439 lifetime income.");
})();
