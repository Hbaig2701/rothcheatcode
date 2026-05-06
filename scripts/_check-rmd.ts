/**
 * Sanity-check the baseline RMD math against the IRS Uniform Lifetime Table.
 * Client age 63 today, $1M IRA, 7% growth, no other income, end age 90.
 * Expected: at age N (>= 73), RMD = (balance at end of age N-1) / divisor[N].
 *
 * Run: npx tsx scripts/_check-rmd.ts
 */

import { runGrowthSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";

const client: Client = {
  id: "rmd-check", user_id: "u",
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  blueprint_type: "fia",
  scenario_name: null, filing_status: "single", name: "RMD Test",
  age: 63, spouse_name: null, spouse_age: null,
  qualified_account_value: 1_000_000_00,
  carrier_name: "T", product_name: "T",
  bonus_percent: 0, rate_of_return: 7,
  state: "TX", constraint_type: "none",
  tax_rate: 22, max_tax_rate: 22, tax_payment_source: "from_taxable",
  state_tax_rate: 0, gross_taxable_non_ssi: 0, tax_exempt_non_ssi: 0,
  ssi_payout_age: 67, ssi_annual_amount: 0,
  spouse_ssi_payout_age: 67, spouse_ssi_annual_amount: 0,
  non_ssi_income: [], conversion_type: "no_conversion",
  fixed_conversion_amount: null, target_partial_amount: null,
  respect_penalty_free_limit: false, protect_initial_premium: false,
  // AUM split-allocation (off by default)
  aum_allocation_percent: 0, aum_fee_percent: 1, aum_dividend_yield: 2, aum_turnover_percent: 10, aum_withdrawal_years: 5, ltcg_rate: 15,
  withdrawal_type: "no_withdrawals", payout_type: "individual",
  income_start_age: 65, guaranteed_rate_of_return: 0,
  roll_up_option: null, payout_option: null,
  gi_conversion_years: 5, gi_conversion_bracket: 24,
  surrender_years: 10, surrender_schedule: [10,9,8,7,6,5,4,3,2,1],
  penalty_free_percent: 10, baseline_comparison_rate: 7, post_contract_rate: 7,
  years_to_defer_conversion: 0, end_age: 90, heir_tax_rate: 40,
  widow_analysis: false, widow_death_age: null,
  rmd_treatment: "reinvested",
  date_of_birth: null, spouse_dob: null, life_expectancy: null,
  traditional_ira: 0, roth_ira: 0, taxable_accounts: 0, other_retirement: 0,
  federal_bracket: "auto", include_niit: false, include_aca: false,
  ss_self: 0, ss_spouse: 0, pension: 0, other_income: 0, ss_start_age: 67,
  strategy: "moderate", start_age: 63, growth_rate: 0, inflation_rate: 0,
  heir_bracket: "32", projection_years: 27, sensitivity: false,
  anniversary_bonus_percent: null, anniversary_bonus_years: null,
  custom_product_id: null,
  withdrawals: [],
} as Client;

const IRS_DIVISORS: Record<number, number> = {
  73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0,
  79: 21.1, 80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0,
};

const result = runGrowthSimulation(createSimulationInput(client));
const baseline = result.baseline;

const fmt = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

console.log("Year | Age | BOY (= prior EOY) | RMD       | EOY        | Implied div | IRS div | Match");
console.log("-".repeat(100));
let mismatches = 0;
for (const y of baseline) {
  if (y.age < 72 || y.age > 86) continue;
  const boy = y.traditionalBOY ?? 0;
  const rmd = y.rmdAmount;
  const eoy = y.traditionalBalance;
  const impliedDivisor = rmd > 0 ? boy / rmd : 0;
  const irsDivisor = IRS_DIVISORS[y.age];
  const match =
    irsDivisor != null && rmd > 0 ? Math.abs(impliedDivisor - irsDivisor) < 0.05 : null;
  if (match === false) mismatches++;
  console.log(
    `${y.year} | ${y.age}  | ${fmt(boy).padStart(13)} | ${fmt(rmd).padStart(9)} | ${fmt(eoy).padStart(11)} | ${impliedDivisor.toFixed(2).padStart(7)}     | ${irsDivisor ?? "-".padStart(5)} | ${match === null ? "—" : match ? "✓" : "✗ MISMATCH"}`,
  );
}

console.log("\nResult: " + (mismatches === 0 ? "✓ all RMDs use prior-year EOY balance per IRS rules" : `✗ ${mismatches} mismatches`));
process.exitCode = mismatches > 0 ? 1 : 0;
