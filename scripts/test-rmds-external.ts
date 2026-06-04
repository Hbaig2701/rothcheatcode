/**
 * Regression test for the rmds_handled_externally toggle.
 *
 * Confirms:
 *   1. Toggle OFF (default) → engine computes RMDs (baseline shows RMD income)
 *   2. Toggle ON → engine skips RMDs entirely (no RMD in any year)
 *   3. Partial Amount conversion target HITS its mark with toggle ON
 *      (the Greg Stopp / Policar bug — $1.3M target was landing at $1.17M
 *      because RMDs were drawing from the same bucket).
 *
 * Run: npx tsx scripts/test-rmds-external.ts
 */
import { runGrowthFormulaScenario } from "../lib/calculations/scenarios/growth-formula";
import { runBaselineScenario } from "../lib/calculations/scenarios/baseline";
import type { Client } from "../lib/types/client";

const BASE_CLIENT: Partial<Client> = {
  age: 75,
  spouse_age: 73,
  filing_status: "married_filing_jointly",
  state: "CA",
  // $1.3M IRA (just the modeled Athene bucket, not the full $2.5M)
  qualified_account_value: 130_000_000,
  roth_ira: 0,
  ssi_payout_age: 69,
  ssi_annual_amount: 4_200_000,
  spouse_ssi_payout_age: 67,
  spouse_ssi_annual_amount: 3_000_000,
  spouse_name: "Kristi",
  tax_rate: 24,
  max_tax_rate: 32,
  state_tax_rate: 9.3,
  // Partial Amount $1.3M = full conversion of the modeled bucket
  conversion_type: "partial_amount",
  target_partial_amount: 130_000_000,
  constraint_type: "bracket_ceiling",
  // Tax from taxable so the IRA isn't drained by tax-on-conversion (which would
  // be a separate constraint from RMDs). This isolates the toggle's effect.
  tax_payment_source: "from_taxable",
  taxable_accounts: 100_000_000,
  blueprint_type: "vesting-bonus-growth",
  rate_of_return: 7,
  bonus_percent: 19,
  end_age: 95,
  heir_tax_rate: 40,
  non_ssi_income: [],
  withdrawals: [],
  rmd_treatment: "reinvested",
  baseline_comparison_rate: 7,
  post_contract_rate: 7,
  years_to_defer_conversion: 0,
  penalty_free_percent: 10,
  surrender_years: 10,
  respect_penalty_free_limit: false,
  penalty_free_scope: "tax_only",
  protect_initial_premium: true,
};

function mk(overrides: Partial<Client>): Client {
  return { ...BASE_CLIENT, ...overrides } as unknown as Client;
}

function sumConversions(years: Array<{ conversionAmount?: number }>): number {
  return years.reduce((acc, y) => acc + (y.conversionAmount ?? 0), 0);
}

function maxRmdInYears(years: Array<{ rmdAmount?: number }>): number {
  return years.reduce((acc, y) => Math.max(acc, y.rmdAmount ?? 0), 0);
}

const startYear = 2026;
const projYears = 20;

console.log("=".repeat(72));
console.log("TEST 1: Toggle OFF (default) — RMDs computed");
console.log("=".repeat(72));
const clientOff = mk({ rmds_handled_externally: false });
const baseOff = runBaselineScenario(clientOff, startYear, projYears);
const stratOff = runGrowthFormulaScenario(clientOff, startYear, projYears, null);
const baseMaxRmdOff = maxRmdInYears(baseOff);
const stratMaxRmdOff = maxRmdInYears(stratOff);
const stratConvertedOff = sumConversions(stratOff);
console.log(`  Baseline max RMD across years:  $${(baseMaxRmdOff / 100).toFixed(0)}`);
console.log(`  Strategy max RMD across years:  $${(stratMaxRmdOff / 100).toFixed(0)}`);
console.log(`  Strategy total converted:       $${(stratConvertedOff / 100).toFixed(0)}`);
console.log(`  Target was $1,300,000`);

console.log("\n" + "=".repeat(72));
console.log("TEST 2: Toggle ON — RMDs skipped entirely");
console.log("=".repeat(72));
const clientOn = mk({ rmds_handled_externally: true });
const baseOn = runBaselineScenario(clientOn, startYear, projYears);
const stratOn = runGrowthFormulaScenario(clientOn, startYear, projYears, null);
const baseMaxRmdOn = maxRmdInYears(baseOn);
const stratMaxRmdOn = maxRmdInYears(stratOn);
const stratConvertedOn = sumConversions(stratOn);
console.log(`  Baseline max RMD across years:  $${(baseMaxRmdOn / 100).toFixed(0)}`);
console.log(`  Strategy max RMD across years:  $${(stratMaxRmdOn / 100).toFixed(0)}`);
console.log(`  Strategy total converted:       $${(stratConvertedOn / 100).toFixed(0)}`);
console.log(`  Target was $1,300,000`);

console.log("\n" + "=".repeat(72));
console.log("VERDICT");
console.log("=".repeat(72));
let pass = true;
const checks: Array<[string, boolean]> = [
  ["TEST 1 baseline has RMDs (>0)", baseMaxRmdOff > 0],
  ["TEST 1 strategy may have RMDs (>=0)", stratMaxRmdOff >= 0],
  ["TEST 2 baseline RMDs = 0", baseMaxRmdOn === 0],
  ["TEST 2 strategy RMDs = 0", stratMaxRmdOn === 0],
  // With toggle ON, partial conversion should reach the target much more cleanly.
  // Allow some tolerance because the engine may still leave a small residual.
  ["TEST 2 conversion within 1% of $1.3M target", Math.abs(stratConvertedOn - 130_000_000) <= 1_300_000],
];
for (const [label, ok] of checks) {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) pass = false;
}
console.log("\nDelta on converted amount (toggle ON vs OFF):");
console.log(`  OFF: $${(stratConvertedOff / 100).toFixed(0)}`);
console.log(`  ON:  $${(stratConvertedOn / 100).toFixed(0)}`);
console.log(`  +$${((stratConvertedOn - stratConvertedOff) / 100).toFixed(0)} more converted when RMDs are external`);

if (!pass) {
  console.log("\nFAILED");
  process.exit(1);
}
console.log("\nALL CHECKS PASSED");
