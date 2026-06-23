/**
 * Sanity-checks the numbers the GILegacyReportDashboard will display, computed
 * the same way the component does — from the legacy-mode simulation output.
 *
 * Usage: npx tsx scripts/validate-legacy-report.ts
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

function karen(): Client {
  return {
    name: "Karen (legacy report)", age: 70, date_of_birth: "1956-01-01",
    filing_status: "single", state: "CA", qualified_account_value: 100_000_000,
    custom_product_id: PRODUCT_ID, blueprint_type: "flat-rate-compound-income",
    rate_of_return: 6, guaranteed_rate_of_return: 6, payout_type: "individual",
    payout_option: "level", roll_up_option: null, end_age: 95, projection_years: 25,
    ss_self: 0, ssi_annual_amount: 0, bonus_percent: 55, tax_payment_source: "from_taxable",
    gi_conversion_years: 5, income_start_age: 65, gi_legacy_mode: true,
    rmd_treatment: "reinvested", heir_tax_rate: 40,
  } as unknown as Client;
}
const last = <T,>(a: T[]) => a[a.length - 1];

(async () => {
  const { data } = await admin.from("custom_products").select("*").eq("id", PRODUCT_ID).single();
  const raw = data as CustomProductRow;
  const product: CustomProductRow = { ...raw, config: { ...raw.config, income: { ...raw.config.income!, roll_up_credit_basis: "account_value", benefit_base_draws_down: true } } };
  const sim = runGuaranteedIncomeSimulation(createSimulationInput(karen(), product));
  const m = sim.giMetrics;
  const heirRate = 0.4;

  // Exactly the report's computation:
  const strategyDB = last(m.yearlyData).incomeBase;
  const baselineDB = last(m.baselineYearlyData).incomeBase;
  const strategyTaxable = last(sim.formula).taxableBalance;
  const baselineTaxable = last(sim.baseline).taxableBalance;
  const strategyLegacy = strategyDB + strategyTaxable;
  const baselineLegacy = Math.round(baselineDB * (1 - heirRate)) + baselineTaxable;
  const additionalLegacy = strategyLegacy - baselineLegacy;
  const lifetimeRMD = sim.baseline.reduce((s, r) => s + (r.rmdAmount ?? 0), 0);
  const lifetimeRMDTax = sim.baseline.reduce((s, r) => s + (r.federalTax ?? 0) + (r.stateTax ?? 0), 0);
  const conversionTax = m.totalConversionTax ?? 0;

  console.log("=== GILegacyReportDashboard numbers (Karen 70, $1M, 6%, legacy) ===\n");
  console.log(`HERO  tax-free death benefit (Roth):   ${usd(strategyDB)}`);
  console.log(`      vs do-nothing legacy (after tax): ${usd(baselineLegacy)}`);
  console.log(`      additional legacy to heirs:       ${usd(additionalLegacy)}\n`);
  console.log(`COMPARE  convert (total):  ${usd(strategyLegacy)}`);
  console.log(`         do nothing:       ${usd(baselineLegacy)}\n`);
  console.log(`CARDS  forced RMDs avoided:  ${usd(lifetimeRMD)}`);
  console.log(`       RMD tax avoided:      ${usd(lifetimeRMDTax)}`);
  console.log(`       conversion cost:      ${usd(conversionTax)}\n`);

  const checks = [
    ["death benefit > 0", strategyDB > 0],
    ["baseline legacy > 0", baselineLegacy > 0],
    ["lifetime RMDs > 0 (do-nothing forced to withdraw)", lifetimeRMD > 0],
    ["RMD tax > 0", lifetimeRMDTax > 0],
    ["conversion cost > 0", conversionTax > 0],
    ["Roth legacy beats do-nothing", additionalLegacy > 0],
  ] as const;
  for (const [label, ok] of checks) console.log(`  ${ok ? "✅" : "❌"} ${label}`);
  process.exit(0);
})();
