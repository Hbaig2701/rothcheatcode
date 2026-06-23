/**
 * Validates legacy / no-income mode (gi_legacy_mode) for the Athene Agility 10.
 *
 * In legacy mode the annuity is converted to Roth and HELD for heirs — no
 * lifetime income, no RMDs. The benefit base keeps rolling up and is the tax-
 * free death benefit. Checks:
 *   (A) legacy on  → ZERO income-phase years, zero income paid.
 *   (B) legacy on, baseline (pure annuity), 0% → benefit base held at $465,000
 *       every year (illustration's deferral "Death Benefit Over 5 Years" column,
 *       extended with no draw-down).
 *   (C) legacy on, baseline, 5% → benefit base ROLLS UP (rising every year).
 *   (D) legacy OFF → income phase still present (regression sanity).
 *
 * Usage: npx tsx scripts/validate-agility-legacy.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { runGuaranteedIncomeSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";
import type { CustomProductRow } from "../lib/products/types";

config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const PRODUCT_ID = "287cd15a-08f0-467b-894a-37af0176c36c";
const usd = (c: number) => "$" + Math.round(c / 100).toLocaleString();

function karen(rate: number, legacy: boolean): Client {
  return {
    name: "Karen (Agility legacy)", age: 55, date_of_birth: "1971-01-01",
    filing_status: "single", state: "CA",
    qualified_account_value: 30_000_000,
    custom_product_id: PRODUCT_ID, blueprint_type: "flat-rate-compound-income",
    rate_of_return: rate, guaranteed_rate_of_return: rate,
    payout_type: "individual", payout_option: "level", roll_up_option: null,
    end_age: 95, projection_years: 40, ss_self: 0, ssi_annual_amount: 0,
    bonus_percent: 55, tax_payment_source: "from_taxable",
    gi_conversion_years: 1, income_start_age: 65, gi_legacy_mode: legacy,
  } as unknown as Client;
}

(async () => {
  const { data } = await admin.from("custom_products").select("*").eq("id", PRODUCT_ID).single();
  const product = data as CustomProductRow;
  const sim = (rate: number, legacy: boolean) => runGuaranteedIncomeSimulation(createSimulationInput(karen(rate, legacy), product)).giMetrics;

  console.log("=== (A) legacy ON → no income ===");
  const aLeg = sim(5, true);
  const incYears = aLeg.yearlyData.filter((y) => y.phase === "income").length;
  console.log(`  strategy income-phase years: ${incYears}  | total gross income paid: ${usd(aLeg.totalGrossPaid)}  ${incYears === 0 && aLeg.totalGrossPaid === 0 ? "✅" : "❌"}`);

  console.log("\n=== (B) legacy ON, baseline (pure annuity), 0% → benefit base held $465,000 ===");
  const b = sim(0, true);
  const bYears = b.baselineYearlyData.filter((y) => y.phase === "deferral" || y.phase === "purchase");
  const allHeld = bYears.every((y) => Math.abs(y.incomeBase - 46_500_000) <= 100);
  console.log(`  ${bYears.length} held years; first ${usd(bYears[0].incomeBase)}, last ${usd(bYears[bYears.length - 1].incomeBase)}  ${allHeld ? "✅ all $465,000" : "❌ not held"}`);

  console.log("\n=== (C) legacy ON, baseline, 5% → benefit base rolls up ===");
  const c = sim(5, true);
  const cYears = c.baselineYearlyData.filter((y) => y.phase === "deferral" || y.phase === "purchase");
  let rising = true;
  for (let i = 1; i < Math.min(cYears.length, 10); i++) if (cYears[i].incomeBase < cYears[i - 1].incomeBase) rising = false;
  console.log(`  age ${cYears[0].age}: ${usd(cYears[0].incomeBase)} → age ${cYears[Math.min(9, cYears.length - 1)].age}: ${usd(cYears[Math.min(9, cYears.length - 1)].incomeBase)}  ${rising ? "✅ rising" : "❌ not rising"}`);

  console.log("\n=== (D) legacy OFF → income phase present (regression) ===");
  const d = sim(5, false);
  const dInc = d.yearlyData.filter((y) => y.phase === "income").length;
  console.log(`  strategy income-phase years: ${dInc}  ${dInc > 0 ? "✅ income still works" : "❌ broken"}`);
  process.exit(0);
})();
