/**
 * Tests for the voluntary IRA/Roth withdrawal schedule.
 *
 * Verifies that withdrawals reduce the right balance, add the right amount
 * to taxable income, trigger the 10% early-withdrawal penalty, and that
 * 'auto' source naturally splits between scenarios (IRA in baseline,
 * Roth in strategy).
 *
 * Run: npx tsx scripts/test-withdrawals.ts
 */

import {
  runSimulation,
  runGrowthSimulation,
  runGuaranteedIncomeSimulation,
  createSimulationInput,
} from "../lib/calculations";
import type { Client, WithdrawalEntry } from "../lib/types/client";

let testNum = 0;
let failures = 0;
function startTest(n: string) { testNum++; console.log(`\n--- Test ${testNum}: ${n} ---`); }
function note(m: string) { console.log(`  · ${m}`); }
function assert(c: boolean, m: string) {
  if (c) { console.log(`  ✓ PASS: ${m}`); return true; }
  console.error(`  ✗ FAIL: ${m}`);
  failures++; process.exitCode = 1;
  return false;
}
const fmt = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

function makeClient(overrides: Partial<Client>): Client {
  const base: Partial<Client> = {
    id: "wd-test", user_id: "u",
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    blueprint_type: "fia",
    scenario_name: null, filing_status: "single", name: "T",
    age: 65, spouse_name: null, spouse_age: null,
    qualified_account_value: 1_000_000_00,
    carrier_name: "T", product_name: "T",
    bonus_percent: 0, rate_of_return: 5,
    state: "TX", constraint_type: "bracket_ceiling",
    tax_rate: 22, max_tax_rate: 22, tax_payment_source: "from_taxable",
    state_tax_rate: 0, gross_taxable_non_ssi: 0, tax_exempt_non_ssi: 0,
    ssi_payout_age: 67, ssi_annual_amount: 0,
    spouse_ssi_payout_age: 67, spouse_ssi_annual_amount: 0,
    non_ssi_income: [], withdrawals: [],
    conversion_type: "no_conversion",
    fixed_conversion_amount: null, target_partial_amount: null,
    respect_penalty_free_limit: false, protect_initial_premium: false,
  // AUM split-allocation (off by default)
  aum_allocation_percent: 0, aum_fee_percent: 1, aum_dividend_yield: 2, aum_turnover_percent: 10, aum_withdrawal_years: 5, ltcg_rate: 15,
    withdrawal_type: "no_withdrawals", payout_type: "individual",
    income_start_age: 65, guaranteed_rate_of_return: 0,
    roll_up_option: null, payout_option: null,
    gi_conversion_years: 5, gi_conversion_bracket: 24,
    surrender_years: 10, surrender_schedule: [10,9,8,7,6,5,4,3,2,1],
    penalty_free_percent: 10, baseline_comparison_rate: 5, post_contract_rate: 5,
    years_to_defer_conversion: 0, end_age: 85, heir_tax_rate: 40,
    widow_analysis: false, widow_death_age: null,
    rmd_treatment: "reinvested",
    date_of_birth: null, spouse_dob: null, life_expectancy: null,
    traditional_ira: 0, roth_ira: 0, taxable_accounts: 0, other_retirement: 0,
    federal_bracket: "auto", include_niit: false, include_aca: false,
    ss_self: 0, ss_spouse: 0, pension: 0, other_income: 0, ss_start_age: 67,
    strategy: "moderate", start_age: 65, growth_rate: 0, inflation_rate: 0,
    heir_bracket: "32", projection_years: 21, sensitivity: false,
    anniversary_bonus_percent: null, anniversary_bonus_years: null,
    custom_product_id: null,
  };
  return { ...base, ...overrides } as Client;
}

const CY = new Date().getFullYear();

// ============================================================================
// TEST 1: IRA withdrawal reduces IRA balance and adds to taxable income (baseline)
// ============================================================================
startTest("Baseline IRA withdrawal reduces IRA + adds to ordinary income");
{
  const wd: WithdrawalEntry = { year: CY + 5, age: 70, amount: 50_000_00, source: "ira" };
  const noWd = makeClient({ withdrawals: [] });
  const withWd = makeClient({ withdrawals: [wd] });
  const a = runSimulation(createSimulationInput(noWd));
  const b = runSimulation(createSimulationInput(withWd));
  const yearA = a.baseline.find(y => y.year === CY + 5)!;
  const yearB = b.baseline.find(y => y.year === CY + 5)!;
  note(`No withdrawal — IRA EOY ${fmt(yearA.traditionalBalance)}, taxable income ${fmt(yearA.taxableIncome ?? 0)}`);
  note(`+$50K IRA pull — IRA EOY ${fmt(yearB.traditionalBalance)}, taxable income ${fmt(yearB.taxableIncome ?? 0)}`);
  assert(yearB.iraWithdrawal === 50_000_00, "iraWithdrawal field reflects the pull");
  assert(yearB.traditionalBalance < yearA.traditionalBalance, "IRA balance is lower with the pull");
  // Loss should be at least $50K minus one year's growth recapture.
  const balanceDelta = yearA.traditionalBalance - yearB.traditionalBalance;
  note(`IRA balance delta: ${fmt(balanceDelta)} (≥ $50K expected)`);
  assert(balanceDelta >= 49_000_00, "Balance shrinks by approximately the withdrawal amount");
  assert((yearB.taxableIncome ?? 0) > (yearA.taxableIncome ?? 0), "Taxable income rises with IRA pull");
}

// ============================================================================
// TEST 2: Roth withdrawal reduces Roth + does NOT add to taxable income
// ============================================================================
startTest("Roth withdrawal reduces Roth, leaves taxable income unchanged");
{
  // Seed strategy with conversions so the Roth has a balance.
  const wd: WithdrawalEntry = { year: CY + 7, age: 72, amount: 30_000_00, source: "roth" };
  const noWd = makeClient({ conversion_type: "optimized_amount", withdrawals: [] });
  const withWd = makeClient({ conversion_type: "optimized_amount", withdrawals: [wd] });
  const a = runGrowthSimulation(createSimulationInput(noWd));
  const b = runGrowthSimulation(createSimulationInput(withWd));
  const yearA = a.formula.find(y => y.year === CY + 7)!;
  const yearB = b.formula.find(y => y.year === CY + 7)!;
  note(`No withdrawal — Roth EOY ${fmt(yearA.rothBalance)}, taxable income ${fmt(yearA.taxableIncome ?? 0)}`);
  note(`+$30K Roth pull — Roth EOY ${fmt(yearB.rothBalance)}, taxable income ${fmt(yearB.taxableIncome ?? 0)}`);
  assert(yearB.rothWithdrawal === 30_000_00, "rothWithdrawal field reflects the pull");
  assert(yearB.rothBalance < yearA.rothBalance, "Roth balance shrinks");
  // Taxable income shouldn't change because of a Roth pull (everything else equal).
  // Conversion sizing may shift slightly because Roth's growth profile changes the
  // starting balance for the next year — within the SAME year the optimizer sees
  // the same starting state, so taxable income should be (very close to) equal.
  const incomeDelta = Math.abs((yearB.taxableIncome ?? 0) - (yearA.taxableIncome ?? 0));
  note(`Same-year taxable income delta: ${fmt(incomeDelta)}`);
  assert(incomeDelta < 100, "Roth pull does NOT add to taxable income");
}

// ============================================================================
// TEST 3: 'auto' source — baseline pulls from IRA, strategy pulls from Roth
// ============================================================================
startTest("'auto' source naturally splits: baseline uses IRA, strategy uses Roth");
{
  const wd: WithdrawalEntry = { year: CY + 8, age: 73, amount: 40_000_00, source: "auto" };
  const client = makeClient({ conversion_type: "optimized_amount", withdrawals: [wd] });
  const r = runGrowthSimulation(createSimulationInput(client));
  const baseYr = r.baseline.find(y => y.year === CY + 8)!;
  const stratYr = r.formula.find(y => y.year === CY + 8)!;
  note(`Baseline: IRA pull ${fmt(baseYr.iraWithdrawal ?? 0)}, Roth pull ${fmt(baseYr.rothWithdrawal ?? 0)}`);
  note(`Strategy: IRA pull ${fmt(stratYr.iraWithdrawal ?? 0)}, Roth pull ${fmt(stratYr.rothWithdrawal ?? 0)}`);
  // Baseline has no Roth balance — auto falls to IRA.
  assert((baseYr.iraWithdrawal ?? 0) === 40_000_00, "Baseline pulls full $40K from IRA");
  assert((baseYr.rothWithdrawal ?? 0) === 0, "Baseline pulls $0 from (empty) Roth");
  // Strategy has a Roth balance from conversions — auto pulls from Roth first.
  assert((stratYr.rothWithdrawal ?? 0) > 0, "Strategy pulls from Roth (non-zero)");
}

// ============================================================================
// TEST 4: 10% early-withdrawal penalty on IRA pull when under 59.5
// ============================================================================
startTest("Pre-59.5 IRA pull triggers 10% early-withdrawal penalty");
{
  const wd: WithdrawalEntry = { year: CY + 1, age: 56, amount: 20_000_00, source: "ira" };
  const client = makeClient({
    age: 55,
    end_age: 80,
    surrender_years: 0, // disable surrender so engine doesn't muck with our amount
    withdrawals: [wd],
  });
  const r = runSimulation(createSimulationInput(client));
  const yr = r.baseline.find(y => y.year === CY + 1)!;
  note(`Year ${yr.year} (age ${yr.age}): IRA pull ${fmt(yr.iraWithdrawal ?? 0)}, early penalty ${fmt(yr.earlyWithdrawalPenalty ?? 0)}`);
  // Penalty = 10% of the IRA pull = $2,000 = 200_000 cents.
  assert((yr.earlyWithdrawalPenalty ?? 0) === 2_000_00, "Penalty equals 10% of the IRA pull");
}

// ============================================================================
// TEST 5: Cap at available balance — large IRA pull doesn't go negative
// ============================================================================
startTest("IRA withdrawal caps at available balance");
{
  const wd: WithdrawalEntry = { year: CY + 5, age: 70, amount: 9_999_999_00, source: "ira" };
  const client = makeClient({ withdrawals: [wd] });
  const r = runSimulation(createSimulationInput(client));
  const yr = r.baseline.find(y => y.year === CY + 5)!;
  note(`Requested $10M from a $1M IRA — actual pull ${fmt(yr.iraWithdrawal ?? 0)}, EOY ${fmt(yr.traditionalBalance)}`);
  assert(yr.traditionalBalance >= 0, "IRA balance never goes negative");
  assert((yr.iraWithdrawal ?? 0) < 9_999_999_00, "Pull is capped below the requested amount");
  assert((yr.iraWithdrawal ?? 0) > 0, "Some amount was pulled (whatever was available)");
}

// ============================================================================
// TEST 6: GI engine — conversion-phase withdrawal flows through
// ============================================================================
startTest("GI conversion-phase withdrawal reduces traditional + adds to taxable");
{
  const wd: WithdrawalEntry = { year: CY + 1, age: 66, amount: 25_000_00, source: "ira" };
  const noWd = makeClient({
    blueprint_type: "simple-rollup-income",
    age: 65,
    end_age: 90,
    income_start_age: 70,
    gi_conversion_years: 5,
    withdrawals: [],
  });
  const withWd = makeClient({
    blueprint_type: "simple-rollup-income",
    age: 65,
    end_age: 90,
    income_start_age: 70,
    gi_conversion_years: 5,
    withdrawals: [wd],
  });
  const a = runGuaranteedIncomeSimulation(createSimulationInput(noWd));
  const b = runGuaranteedIncomeSimulation(createSimulationInput(withWd));
  const yearA = a.formula.find(y => y.year === CY + 1)!;
  const yearB = b.formula.find(y => y.year === CY + 1)!;
  note(`No WD: traditional EOY ${fmt(yearA.traditionalBalance)}, taxable income ${fmt(yearA.taxableIncome ?? 0)}`);
  note(`+$25K: traditional EOY ${fmt(yearB.traditionalBalance)}, iraWithdrawal ${fmt(yearB.iraWithdrawal ?? 0)}, taxable ${fmt(yearB.taxableIncome ?? 0)}`);
  assert((yearB.iraWithdrawal ?? 0) === 25_000_00, "GI engine surfaces iraWithdrawal");
  assert(yearB.traditionalBalance < yearA.traditionalBalance, "Traditional balance shrinks in GI conversion phase");
}

// ============================================================================
// TEST 7: No-withdrawal client matches prior behavior (regression guard)
// ============================================================================
startTest("Empty schedule produces the same numbers as before (regression guard)");
{
  const client = makeClient({ conversion_type: "optimized_amount", withdrawals: [] });
  const r = runGrowthSimulation(createSimulationInput(client));
  // Spot-check: every year should have iraWithdrawal=0 and rothWithdrawal=0.
  let badYears = 0;
  for (const y of r.formula) {
    if ((y.iraWithdrawal ?? 0) !== 0 || (y.rothWithdrawal ?? 0) !== 0) badYears++;
  }
  for (const y of r.baseline) {
    if ((y.iraWithdrawal ?? 0) !== 0 || (y.rothWithdrawal ?? 0) !== 0) badYears++;
  }
  assert(badYears === 0, "All years show 0 withdrawals when schedule is empty");
}

console.log(`\n=== ${testNum} tests ${failures > 0 ? `FAILED (${failures})` : "PASSED"} ===`);
