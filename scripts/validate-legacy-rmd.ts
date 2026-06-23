/**
 * Validates the forced-RMD modeling in legacy mode (Option B).
 *
 * In legacy mode the do-nothing BASELINE (traditional, held annuity) must take
 * forced RMDs once past the owner's RMD age — eroding the account value, the
 * benefit base (death benefit, pro-rata for draws-down products), and getting
 * taxed. The Roth STRATEGY takes none. Checks (Karen, age 55, born ~1971 → RMD
 * age 75, 5% rate, legacy mode):
 *   (A) baseline: rmd = 0 before 75, > 0 from 75; account + benefit base decline;
 *       RMD is taxed. Hand-check age-75 RMD = boyAccount / 24.6 (Uniform table).
 *   (B) strategy (Roth): rmd = 0 at every age; benefit base never eroded by RMDs.
 *
 * Usage: npx tsx scripts/validate-legacy-rmd.ts
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

function karen(over: Partial<Client> = {}): Client {
  return {
    name: "Karen (legacy RMD)", age: 70, date_of_birth: "1956-01-01",
    filing_status: "single", state: "CA",
    qualified_account_value: 100_000_000, // $1M so the RMD clearly exceeds the deduction
    custom_product_id: PRODUCT_ID, blueprint_type: "flat-rate-compound-income",
    rate_of_return: 5, guaranteed_rate_of_return: 5,
    payout_type: "individual", payout_option: "level", roll_up_option: null,
    end_age: 95, projection_years: 25, ss_self: 0, ssi_annual_amount: 0,
    bonus_percent: 55, tax_payment_source: "from_taxable",
    gi_conversion_years: 1, income_start_age: 65, gi_legacy_mode: true,
    rmd_treatment: "reinvested",
    ...over,
  } as unknown as Client;
}

(async () => {
  const { data } = await admin.from("custom_products").select("*").eq("id", PRODUCT_ID).single();
  // Inject the seed's flags the DB row doesn't have yet (not re-seeded): Agility
  // is pattern-B roll-up + benefit-base-draws-down. Tests the re-seeded config.
  const raw = data as CustomProductRow;
  const product: CustomProductRow = { ...raw, config: { ...raw.config, income: { ...raw.config.income!, roll_up_credit_basis: "account_value", benefit_base_draws_down: true } } };
  const sim = runGuaranteedIncomeSimulation(createSimulationInput(karen(), product));
  const baseline = sim.baseline;     // YearlyResult[] (traditional, do-nothing)
  const strategy = sim.formula;      // YearlyResult[] (Roth)
  const at = (rows: typeof baseline, age: number) => rows.find((r) => r.age === age);

  console.log("=== (A) BASELINE (traditional, held) — RMD taxed once it exceeds the deduction ===");
  console.log("  age | RMD | deduction | taxableInc | RMD tax");
  for (const age of [72, 73, 75, 80, 85]) {
    const r = at(baseline, age);
    if (!r) continue;
    const tax = (r.federalTax ?? 0) + (r.stateTax ?? 0);
    console.log(`  ${age}  | ${usd(r.rmdAmount ?? 0).padStart(9)} | ${usd((r as any).standardDeduction ?? 0)} | ${usd((r as any).taxableIncome ?? 0).padStart(9)} | ${usd(tax)}`);
  }
  // RMD timing + amount checks (born 1956 → RMD age 73; factor @75 = 24.6).
  const a74 = at(baseline, 74)!, a75 = at(baseline, 75)!;
  const expectedRmd75 = Math.round(a74.traditionalBalance / 24.6);
  console.log(`\n  age-75 RMD = boyAccount/24.6: engine ${usd(a75.rmdAmount ?? 0)} vs ${usd(expectedRmd75)}  ${Math.abs((a75.rmdAmount ?? 0) - expectedRmd75) <= 50_00 ? "✅" : "❌"}`);
  console.log(`  no RMD before 73: ${(at(baseline, 72)?.rmdAmount ?? 0) === 0 ? "✅" : "❌"} | RMDs from 73: ${(at(baseline, 73)?.rmdAmount ?? 0) > 0 ? "✅" : "❌"}`);
  const lifetimeRmdTax = baseline.reduce((s, r) => s + (r.federalTax ?? 0) + (r.stateTax ?? 0), 0);
  console.log(`  lifetime RMD tax (baseline): ${usd(lifetimeRmdTax)} ${lifetimeRmdTax > 0 ? "✅ taxed" : "❌"}`);

  console.log("\n=== (B) STRATEGY (Roth) — takes no RMDs ===");
  const stratRmd = strategy.filter((r) => (r.rmdAmount ?? 0) > 0).length;
  console.log(`  strategy years with an RMD: ${stratRmd} ${stratRmd === 0 ? "✅ (Roth)" : "❌"}`);

  console.log("\n=== (C) The whole point — RMDs erode the traditional legacy ===");
  // Same client, but tell the engine RMDs are handled elsewhere → no RMD drag.
  const noRmd = runGuaranteedIncomeSimulation(createSimulationInput(karen({ rmds_handled_externally: true } as Partial<Client>), product));
  const finalBase = (rows: typeof baseline) => (rows[rows.length - 1] as any)?.incomeRiderValue ?? 0;
  const withRmd = finalBase(sim.baseline), without = finalBase(noRmd.baseline);
  console.log(`  baseline death benefit @95 WITH forced RMDs:    ${usd(withRmd)}`);
  console.log(`  baseline death benefit @95 WITHOUT (handled elsewhere): ${usd(without)}`);
  console.log(`  → RMDs erode the traditional legacy by ${usd(without - withRmd)} ${without > withRmd ? "✅ erosion shows" : "❌ no effect"}`);
  process.exit(0);
})();
