/**
 * Validates the pro-rata benefit-base draw-down (benefit_base_draws_down) for
 * Athene Agility 10 against the carrier illustration's GUARANTEED (0%) column.
 *
 * At 0% credited there is no roll-up, so the income-phase benefit base draws
 * down PURELY pro-rata: each year base ×= (1 − income / beginning contract
 * value). The illustration's "Ending Benefit Base" during income (Karen, $300k,
 * income @65, $23,250/yr) is: 428,963 → 392,925 → 356,888 → … → 0 at age 77.
 *
 * Runs the BASELINE scenario (pure annuity = the illustration) at 0% with
 * benefit_base_draws_down forced on (no DB mutation) and compares to the dollar.
 *
 * Usage: npx tsx scripts/validate-agility-prorata.ts
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

// Illustration "Ending Benefit Base" during the income phase (guaranteed/0%).
const EXPECTED: Record<number, number> = {
  65: 428963, 66: 392925, 67: 356888, 68: 320850, 69: 284813, 70: 248775,
  71: 212738, 72: 176700, 73: 140663, 74: 104625, 75: 68588, 76: 32550, 77: 0,
};

function karen(): Client {
  return {
    name: "Karen (Agility prorata)", age: 55, date_of_birth: "1971-01-01",
    filing_status: "single", state: "CA",
    qualified_account_value: 30_000_000, // $300,000 in CENTS
    custom_product_id: PRODUCT_ID, blueprint_type: "flat-rate-compound-income",
    rate_of_return: 0, guaranteed_rate_of_return: 0,
    payout_type: "individual", payout_option: "level", roll_up_option: null,
    end_age: 105, projection_years: 45, ss_self: 0, ssi_annual_amount: 0,
    bonus_percent: 55, tax_payment_source: "from_taxable",
    gi_conversion_years: 1, income_start_age: 65,
  } as unknown as Client;
}

(async () => {
  const { data } = await admin.from("custom_products").select("*").eq("id", PRODUCT_ID).single();
  const base = data as CustomProductRow;
  // Force the draw-down flag on in-memory (DB not re-seeded yet).
  const product: CustomProductRow = { ...base, config: { ...base.config, income: { ...base.config.income!, benefit_base_draws_down: true } } };

  // Baseline scenario = pure traditional annuity = the illustration.
  const { giMetrics } = runGuaranteedIncomeSimulation(createSimulationInput(karen(), product));
  const income = giMetrics.baselineYearlyData.filter((y) => y.phase === "income");

  console.log(`Agility pro-rata draw-down @0% (illustration GUARANTEED column)\n`);
  let maxErr = 0, n = 0;
  for (const y of income) {
    const exp = EXPECTED[y.age];
    if (exp === undefined) continue;
    const err = Math.abs(exp * 100 - y.incomeBase); // EXPECTED in $, incomeBase in cents
    maxErr = Math.max(maxErr, err); n++;
    console.log(`  age ${y.age}: benefit base ${usd(y.incomeBase).padStart(10)}  (illustration ${("$" + exp.toLocaleString()).padStart(10)})  Δ ${usd(err)}`);
  }
  console.log(`\n  → ${n} income years checked, max error ${usd(maxErr)} ${maxErr <= 200 ? "✅ matches illustration" : "❌ MISMATCH"}`);
  process.exit(0);
})();
