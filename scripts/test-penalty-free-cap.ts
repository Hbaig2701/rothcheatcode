/**
 * Numbered tests for the respect_penalty_free_limit cap.
 *
 * Run with: npx tsx scripts/test-penalty-free-cap.ts
 *
 * Each test instantiates a synthetic Client, runs the Growth FIA strategy engine,
 * and asserts properties of the year-by-year output. All values in CENTS.
 */

import { runGrowthSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";

// Build a baseline client with mostly default values; tests override specific fields.
function makeClient(overrides: Partial<Client>): Client {
  const base: Partial<Client> = {
    id: "test-client",
    user_id: "test-user",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    blueprint_type: "fia",
    scenario_name: null,
    filing_status: "married_filing_jointly",
    name: "Test Client",
    age: 60,
    spouse_name: "Spouse",
    spouse_age: 58,
    qualified_account_value: 100_000_00, // $100K starting IRA (in cents)
    carrier_name: "Test Carrier",
    product_name: "Test Product",
    bonus_percent: 0, // Use 0% bonus to keep IRA = exactly $100K at year 0
    rate_of_return: 0, // 0% growth so cap math is clean to verify
    anniversary_bonus_percent: null,
    anniversary_bonus_years: null,
    state: "TX", // No state tax
    constraint_type: "none",
    tax_rate: 22,
    max_tax_rate: 22,
    tax_payment_source: "from_taxable", // External tax — simpler to verify
    state_tax_rate: 0,
    gross_taxable_non_ssi: 0,
    tax_exempt_non_ssi: 0,
    ssi_payout_age: 67,
    ssi_annual_amount: 0, // No SS to keep tax math simple
    spouse_ssi_payout_age: 67,
    spouse_ssi_annual_amount: 0,
    non_ssi_income: [],
    conversion_type: "optimized_amount",
    fixed_conversion_amount: null,
    target_partial_amount: null,
    respect_penalty_free_limit: false,
    protect_initial_premium: false, // Keep simple — disable floor
    withdrawal_type: "no_withdrawals",
    payout_type: "individual",
    income_start_age: 65,
    guaranteed_rate_of_return: 0,
    roll_up_option: null,
    payout_option: null,
    gi_conversion_years: 5,
    gi_conversion_bracket: 24,
    surrender_years: 10,
    surrender_schedule: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
    penalty_free_percent: 10,
    baseline_comparison_rate: 0,
    post_contract_rate: 0,
    years_to_defer_conversion: 0,
    end_age: 75, // 15-year projection
    heir_tax_rate: 40,
    widow_analysis: false,
    rmd_treatment: "reinvested",
    date_of_birth: null,
    spouse_dob: null,
    life_expectancy: null,
    traditional_ira: 0,
    roth_ira: 0,
    taxable_accounts: 0,
    other_retirement: 0,
    federal_bracket: "auto",
    include_niit: false,
    include_aca: false,
    ss_self: 0,
    ss_spouse: 0,
    pension: 0,
    other_income: 0,
    ss_start_age: 67,
    strategy: "moderate",
    start_age: 60,
    growth_rate: 0,
    inflation_rate: 0,
    heir_bracket: "32",
    projection_years: 15,
    sensitivity: false,
  };
  return { ...base, ...overrides } as Client;
}

function assert(cond: boolean, message: string) {
  if (!cond) {
    console.error(`  ✗ ASSERTION FAILED: ${message}`);
    process.exitCode = 1;
    return false;
  }
  return true;
}

function fmtCents(c: number): string {
  return `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

let testNum = 0;
function startTest(name: string) {
  testNum++;
  console.log(`\n--- Test ${testNum}: ${name} ---`);
}

// ============================================================================
// TEST 1: Baseline behavior — cap OFF, optimized fills bracket as before
// ============================================================================
startTest("Cap OFF — optimized conversion fills bracket (no cap interference)");
{
  const client = makeClient({
    respect_penalty_free_limit: false,
    conversion_type: "optimized_amount",
    max_tax_rate: 22,
    qualified_account_value: 1_000_000_00, // $1M IRA
  });
  const input = createSimulationInput(client);
  const result = runGrowthSimulation(input);
  const year1 = result.formula[0];
  const conv1 = year1.conversionAmount ?? 0;
  console.log(`  Year 1 conversion: ${fmtCents(conv1)} (no cap → bracket fill)`);
  assert(conv1 > 50_000_00, `Expected substantial bracket-fill conversion, got ${fmtCents(conv1)}`);
}

// ============================================================================
// TEST 2: Cap ON — annual conversion capped at 10% of beginning IRA
// ============================================================================
startTest("Cap ON — year 1 conversion ≤ 10% of starting IRA");
{
  const client = makeClient({
    respect_penalty_free_limit: true,
    conversion_type: "optimized_amount",
    qualified_account_value: 1_000_000_00, // $1M IRA
    penalty_free_percent: 10,
    max_tax_rate: 22,
  });
  const input = createSimulationInput(client);
  const result = runGrowthSimulation(input);
  const year1 = result.formula[0];
  const conv1 = year1.conversionAmount ?? 0;
  const cap = 1_000_000_00 * 0.10; // 10% of $1M = $100K
  console.log(`  Year 1 conversion: ${fmtCents(conv1)} (cap: ${fmtCents(cap)})`);
  assert(conv1 <= cap, `Expected conv1 ≤ cap (${fmtCents(cap)}), got ${fmtCents(conv1)}`);
  assert(conv1 > 0, `Expected non-zero conversion under cap`);
}

// ============================================================================
// TEST 3: Cap shrinks each year as IRA depletes
// ============================================================================
startTest("Cap ON — year 2 cap is smaller than year 1 (IRA depleted)");
{
  const client = makeClient({
    respect_penalty_free_limit: true,
    conversion_type: "optimized_amount",
    qualified_account_value: 1_000_000_00,
    penalty_free_percent: 10,
    max_tax_rate: 22,
  });
  const input = createSimulationInput(client);
  const result = runGrowthSimulation(input);
  const conv1 = result.formula[0].conversionAmount ?? 0;
  const conv2 = result.formula[1].conversionAmount ?? 0;
  const conv3 = result.formula[2].conversionAmount ?? 0;
  console.log(`  Year 1: ${fmtCents(conv1)}`);
  console.log(`  Year 2: ${fmtCents(conv2)}`);
  console.log(`  Year 3: ${fmtCents(conv3)}`);
  assert(conv2 < conv1, `Year 2 should be smaller than year 1 (${fmtCents(conv2)} vs ${fmtCents(conv1)})`);
  assert(conv3 < conv2, `Year 3 should be smaller than year 2 (${fmtCents(conv3)} vs ${fmtCents(conv2)})`);
}

// ============================================================================
// TEST 4: Cap ON + partial_amount — both caps respected (use the smaller)
// ============================================================================
startTest("Cap ON + partial_amount — both caps respected");
{
  const client = makeClient({
    respect_penalty_free_limit: true,
    conversion_type: "partial_amount",
    target_partial_amount: 500_000_00, // $500K total target
    qualified_account_value: 1_000_000_00, // $1M IRA → 10% cap = $100K/yr
    penalty_free_percent: 10,
    max_tax_rate: 22,
  });
  const input = createSimulationInput(client);
  const result = runGrowthSimulation(input);
  const conv1 = result.formula[0].conversionAmount ?? 0;
  const yearlyCap = 1_000_000_00 * 0.10;
  console.log(`  Year 1 conversion: ${fmtCents(conv1)} (yearly cap: ${fmtCents(yearlyCap)}, total target: $500K)`);
  assert(conv1 <= yearlyCap, `Year 1 should respect annual cap`);

  // Cumulative across years should not exceed $500K
  let cumulative = 0;
  for (const y of result.formula) cumulative += y.conversionAmount ?? 0;
  console.log(`  Cumulative converted: ${fmtCents(cumulative)} (target: $500K)`);
  assert(cumulative <= 500_000_00 + 100, `Cumulative should not exceed target+rounding`);
}

// ============================================================================
// TEST 5: Cap ON + payTaxFromIRA — TOTAL withdrawal (conv + tax) ≤ cap
// ============================================================================
startTest("Cap ON + payTaxFromIRA — total IRA withdrawal ≤ carrier cap");
{
  const client = makeClient({
    respect_penalty_free_limit: true,
    conversion_type: "optimized_amount",
    qualified_account_value: 1_000_000_00,
    penalty_free_percent: 10,
    max_tax_rate: 22,
    tax_payment_source: "from_ira", // Tax comes from IRA — counts toward cap
  });
  const input = createSimulationInput(client);
  const result = runGrowthSimulation(input);
  const year1 = result.formula[0];
  const conv1 = year1.conversionAmount ?? 0;
  const fed1 = year1.federalTax ?? 0;
  const state1 = year1.stateTax ?? 0;
  const tax1 = fed1 + state1;
  const totalWithdrawal = conv1 + tax1;
  const cap = 100_000_00;
  console.log(`  Conversion: ${fmtCents(conv1)} + tax-from-IRA: ${fmtCents(tax1)} = ${fmtCents(totalWithdrawal)}`);
  console.log(`  Cap: ${fmtCents(cap)}`);
  assert(totalWithdrawal <= cap + 100, `Total withdrawal must respect cap (within $1 rounding)`);
  assert(conv1 < cap, `Conversion alone should be less than cap (tax took some)`);
}

// ============================================================================
// TEST 6: Cap ON + full_conversion → drains at carrier rate over multiple years
// ============================================================================
startTest("Cap ON + full_conversion — drains across multiple years");
{
  const client = makeClient({
    respect_penalty_free_limit: true,
    conversion_type: "full_conversion",
    qualified_account_value: 1_000_000_00,
    penalty_free_percent: 10,
    max_tax_rate: 32,
    end_age: 75, // 15 years
  });
  const input = createSimulationInput(client);
  const result = runGrowthSimulation(input);
  const conv1 = result.formula[0].conversionAmount ?? 0;
  console.log(`  Year 1 conversion: ${fmtCents(conv1)} (without cap, would be all $1M)`);
  assert(conv1 < 200_000_00, `With cap, full conversion should NOT empty the IRA in year 1`);
  assert(conv1 > 50_000_00, `Should still convert a meaningful amount (≥ $50K)`);
}

// ============================================================================
// TEST 7: Cap ON + 0% penalty-free → no conversions (carrier doesn't allow)
// ============================================================================
startTest("Cap ON + penalty_free_percent = 0 — zero conversions");
{
  const client = makeClient({
    respect_penalty_free_limit: true,
    conversion_type: "optimized_amount",
    qualified_account_value: 1_000_000_00,
    penalty_free_percent: 0, // Carrier doesn't allow ANY free withdrawal
    max_tax_rate: 22,
  });
  const input = createSimulationInput(client);
  const result = runGrowthSimulation(input);
  const conv1 = result.formula[0].conversionAmount ?? 0;
  console.log(`  Year 1 conversion: ${fmtCents(conv1)} (cap: $0)`);
  assert(conv1 === 0, `Expected zero conversion when cap is 0`);
}

// ============================================================================
// TEST 8: Cap OFF + same setup as Test 2 → conversion is materially LARGER
// ============================================================================
startTest("Cap OFF vs Cap ON — Cap OFF year-1 conversion is larger");
{
  const base = {
    conversion_type: "optimized_amount" as const,
    qualified_account_value: 1_000_000_00,
    penalty_free_percent: 10,
    max_tax_rate: 22,
  };
  const offResult = runGrowthSimulation(
    createSimulationInput(makeClient({ ...base, respect_penalty_free_limit: false }))
  );
  const onResult = runGrowthSimulation(
    createSimulationInput(makeClient({ ...base, respect_penalty_free_limit: true }))
  );
  const convOff = offResult.formula[0].conversionAmount ?? 0;
  const convOn = onResult.formula[0].conversionAmount ?? 0;
  console.log(`  Cap OFF year 1: ${fmtCents(convOff)}`);
  console.log(`  Cap ON  year 1: ${fmtCents(convOn)}`);
  assert(convOff > convOn, `Cap OFF must produce a larger year-1 conversion`);
  assert(convOn <= 100_000_00 + 100, `Cap ON must respect 10% cap on $1M`);
}

// ============================================================================
// TEST 9: Cap releases after surrender period ends (year 11+ for 10-yr contract)
// ============================================================================
startTest("Cap releases after surrender period — year 11+ unrestricted");
{
  const client = makeClient({
    respect_penalty_free_limit: true,
    conversion_type: "optimized_amount",
    qualified_account_value: 1_000_000_00,
    penalty_free_percent: 10,
    max_tax_rate: 22,
    surrender_years: 10,
    end_age: 80, // 20-year projection so we see post-contract years
  });
  const input = createSimulationInput(client);
  const result = runGrowthSimulation(input);
  // Year 10 (yearOffset 9) is the LAST year of surrender — cap should still apply
  // Year 11 (yearOffset 10) is post-contract — cap should NOT apply
  const year10 = result.formula[9];
  const year11 = result.formula[10];
  const conv10 = year10?.conversionAmount ?? 0;
  const conv11 = year11?.conversionAmount ?? 0;
  const ira10Boy = year10?.traditionalBalance ?? 0; // BOY of year 10 ≈ EOY year 9
  console.log(`  Year 10 (last surrender yr): conversion ${fmtCents(conv10)}`);
  console.log(`  Year 11 (post-contract):     conversion ${fmtCents(conv11)}`);
  // Year 11 conversion should be larger than the strict 10% cap
  // (assuming there's still IRA balance to convert beyond 10%).
  // Conservative check: year 11 conversion exceeds the year-10-style cap, OR
  // the IRA has been mostly drained by year 11.
  if (ira10Boy > 100_000_00) {
    const wouldBeCap = ira10Boy * 0.10;
    assert(
      conv11 > wouldBeCap || conv11 === 0,
      `Year 11 should ignore the 10% cap (got ${fmtCents(conv11)} vs hypothetical cap ${fmtCents(wouldBeCap)})`
    );
  } else {
    console.log(`  (IRA mostly drained by year 11, can't strictly assert cap release)`);
  }
}

console.log(`\n=== ${testNum} tests ${process.exitCode ? "FAILED" : "PASSED"} ===`);
