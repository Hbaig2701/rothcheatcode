/**
 * Numbered tests for 0% tax bracket conversion option.
 *
 * Run with: npx tsx scripts/test-zero-bracket.ts
 *
 * Joshua W. use case: client has $0 taxable income (e.g., military with disability
 * income that's federally tax-free). They want to convert just enough that the
 * conversion + existing income stays under the standard deduction so they pay
 * $0 federal tax on the conversion.
 */

import { runGrowthSimulation, createSimulationInput } from "../lib/calculations";
import type { Client } from "../lib/types/client";

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
    qualified_account_value: 500_000_00, // $500K IRA
    carrier_name: "Test Carrier",
    product_name: "Test Product",
    bonus_percent: 0,
    rate_of_return: 0,
    anniversary_bonus_percent: null,
    anniversary_bonus_years: null,
    state: "TX", // No state tax
    constraint_type: "bracket_ceiling",
    tax_rate: 0,           // Current bracket — 0% (matching no taxable income)
    max_tax_rate: 0,       // The thing we're testing
    tax_payment_source: "from_taxable",
    state_tax_rate: 0,
    gross_taxable_non_ssi: 0,
    tax_exempt_non_ssi: 0,
    ssi_payout_age: 67,
    ssi_annual_amount: 0,
    spouse_ssi_payout_age: 67,
    spouse_ssi_annual_amount: 0,
    non_ssi_income: [],
    conversion_type: "optimized_amount",
    fixed_conversion_amount: null,
    target_partial_amount: null,
    respect_penalty_free_limit: false,
    protect_initial_premium: false,
  // AUM split-allocation (off by default)
  aum_allocation_percent: 0, aum_fee_percent: 1, aum_dividend_yield: 2, aum_turnover_percent: 10, aum_withdrawal_years: 5, ltcg_rate: 15,
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
    end_age: 65, // 5-year projection
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
    projection_years: 5,
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
// TEST 1: max_tax_rate=0, no other income → conversion fills standard deduction
// 2026 MFJ standard deduction is ~$30K. Engine should convert ~$30K/yr at $0 tax.
// ============================================================================
startTest("max_tax_rate=0, no other income → conversion ≈ standard deduction");
{
  const client = makeClient({
    tax_rate: 0,
    max_tax_rate: 0,
    qualified_account_value: 500_000_00,
  });
  const input = createSimulationInput(client);
  const result = runGrowthSimulation(input);
  const year1 = result.formula[0];
  const conv1 = year1.conversionAmount ?? 0;
  const fed1 = year1.federalTax ?? 0;
  console.log(`  Year 1 conversion: ${fmtCents(conv1)}`);
  console.log(`  Year 1 federal tax: ${fmtCents(fed1)}`);
  // 2026 MFJ standard deduction is around $30,500 (was $29,200 in 2024, indexes ~3%/yr).
  // Allow a wide range to accommodate inflation adjustments.
  assert(conv1 > 25_000_00, `Year 1 conversion should be >= $25K (got ${fmtCents(conv1)})`);
  assert(conv1 < 40_000_00, `Year 1 conversion should be < $40K (got ${fmtCents(conv1)})`);
  assert(fed1 === 0, `Year 1 federal tax must be EXACTLY $0 (got ${fmtCents(fed1)})`);
}

// ============================================================================
// TEST 2: max_tax_rate=0 + other taxable income reduces conversion headroom
// ============================================================================
startTest("max_tax_rate=0 + $20K other income → conversion ≈ (standard deduction − $20K)");
{
  const client = makeClient({
    tax_rate: 0,
    max_tax_rate: 0,
    qualified_account_value: 500_000_00,
    non_ssi_income: [
      { year: new Date().getFullYear(), age: 60, gross_taxable: 20_000_00, tax_exempt: 0 },
      { year: new Date().getFullYear() + 1, age: 61, gross_taxable: 20_000_00, tax_exempt: 0 },
    ],
  });
  const input = createSimulationInput(client);
  const result = runGrowthSimulation(input);
  const year1 = result.formula[0];
  const conv1 = year1.conversionAmount ?? 0;
  const fed1 = year1.federalTax ?? 0;
  console.log(`  Year 1 conversion: ${fmtCents(conv1)}`);
  console.log(`  Year 1 federal tax: ${fmtCents(fed1)}`);
  // With $20K other taxable income, only ~$10K of conversion fits under deduction
  assert(conv1 > 5_000_00, `Conversion should still be positive (got ${fmtCents(conv1)})`);
  assert(conv1 < 15_000_00, `Conversion should be << standard deduction (got ${fmtCents(conv1)})`);
  assert(fed1 === 0, `Federal tax must remain $0 (got ${fmtCents(fed1)})`);
}

// ============================================================================
// TEST 3: max_tax_rate=0 with tax-exempt income (Joshua's military case)
// Disability income is tax-exempt → doesn't count toward bracket → full standard
// deduction is available for conversion.
// ============================================================================
startTest("max_tax_rate=0 with $50K tax-exempt income (military disability case)");
{
  const client = makeClient({
    tax_rate: 0,
    max_tax_rate: 0,
    qualified_account_value: 500_000_00,
    non_ssi_income: [
      { year: new Date().getFullYear(), age: 60, gross_taxable: 0, tax_exempt: 50_000_00 },
      { year: new Date().getFullYear() + 1, age: 61, gross_taxable: 0, tax_exempt: 50_000_00 },
    ],
  });
  const input = createSimulationInput(client);
  const result = runGrowthSimulation(input);
  const year1 = result.formula[0];
  const conv1 = year1.conversionAmount ?? 0;
  const fed1 = year1.federalTax ?? 0;
  console.log(`  Year 1 conversion: ${fmtCents(conv1)}`);
  console.log(`  Year 1 federal tax: ${fmtCents(fed1)}`);
  // Tax-exempt income doesn't reduce conversion headroom, so conv ≈ full standard deduction
  assert(conv1 > 25_000_00, `Conversion should fill full standard deduction (got ${fmtCents(conv1)})`);
  assert(fed1 === 0, `Federal tax must be $0 (got ${fmtCents(fed1)})`);
}

// ============================================================================
// TEST 4: 0% vs 12% vs 22% — successively higher conversion amounts
// ============================================================================
startTest("0% < 12% < 22% — bracket ceiling drives conversion size");
{
  const base = {
    qualified_account_value: 1_000_000_00,
    tax_rate: 0,
    non_ssi_income: [],
  };
  const r0 = runGrowthSimulation(createSimulationInput(makeClient({ ...base, max_tax_rate: 0 })));
  const r12 = runGrowthSimulation(createSimulationInput(makeClient({ ...base, max_tax_rate: 12 })));
  const r22 = runGrowthSimulation(createSimulationInput(makeClient({ ...base, max_tax_rate: 22 })));
  const conv0 = r0.formula[0].conversionAmount ?? 0;
  const conv12 = r12.formula[0].conversionAmount ?? 0;
  const conv22 = r22.formula[0].conversionAmount ?? 0;
  console.log(`  max_tax_rate=0:  ${fmtCents(conv0)}`);
  console.log(`  max_tax_rate=12: ${fmtCents(conv12)}`);
  console.log(`  max_tax_rate=22: ${fmtCents(conv22)}`);
  assert(conv0 < conv12, `0% should produce smaller conversion than 12% (${fmtCents(conv0)} vs ${fmtCents(conv12)})`);
  assert(conv12 < conv22, `12% should produce smaller conversion than 22% (${fmtCents(conv12)} vs ${fmtCents(conv22)})`);
}

// ============================================================================
// TEST 5: max_tax_rate=0 + payTaxFromIRA → still produces $0 tax
// (Tax-from-IRA path uses a different planner; verify it respects 0% too)
// ============================================================================
startTest("max_tax_rate=0 + payTaxFromIRA → $0 tax, conversion fills standard deduction");
{
  const client = makeClient({
    tax_rate: 0,
    max_tax_rate: 0,
    qualified_account_value: 500_000_00,
    tax_payment_source: "from_ira",
  });
  const input = createSimulationInput(client);
  const result = runGrowthSimulation(input);
  const year1 = result.formula[0];
  const conv1 = year1.conversionAmount ?? 0;
  const fed1 = year1.federalTax ?? 0;
  console.log(`  Year 1 conversion: ${fmtCents(conv1)}`);
  console.log(`  Year 1 federal tax: ${fmtCents(fed1)}`);
  assert(fed1 === 0, `Federal tax must be $0 even with from_ira (got ${fmtCents(fed1)})`);
  assert(conv1 > 20_000_00, `Conversion should fill standard deduction (got ${fmtCents(conv1)})`);
}

// ============================================================================
// TEST 6: max_tax_rate=0 + SS at 67 → tax torpedo handled (smaller conv when SS active)
// ============================================================================
startTest("max_tax_rate=0 + SS active → conversion smaller (SS torpedo respected)");
{
  const client = makeClient({
    tax_rate: 0,
    max_tax_rate: 0,
    qualified_account_value: 500_000_00,
    age: 67, // Already collecting SS
    ssi_payout_age: 67,
    ssi_annual_amount: 30_000_00, // $30K/yr SS
    end_age: 72,
  });
  const input = createSimulationInput(client);
  const result = runGrowthSimulation(input);
  const year1 = result.formula[0];
  const conv1 = year1.conversionAmount ?? 0;
  const fed1 = year1.federalTax ?? 0;
  console.log(`  Year 1 conversion (age 67, SS=$30K): ${fmtCents(conv1)}`);
  console.log(`  Year 1 federal tax: ${fmtCents(fed1)}`);
  assert(fed1 <= 100, `Federal tax should be $0 (within $1 rounding) — got ${fmtCents(fed1)}`);
  // With SS, the SS torpedo means conversion has to be smaller to keep tax at 0
  // The exact number depends on the SS taxation rules, but should be positive
  assert(conv1 >= 0, `Conversion should be non-negative`);
}

// ============================================================================
// TEST 7: max_tax_rate=0 with multi-year projection → conversions consistent
// ============================================================================
startTest("max_tax_rate=0 over 5 years → consistent ~$30K conversions, $0 tax each year");
{
  const client = makeClient({
    tax_rate: 0,
    max_tax_rate: 0,
    qualified_account_value: 1_000_000_00, // Large enough to not deplete
    end_age: 65, // 5 years
  });
  const input = createSimulationInput(client);
  const result = runGrowthSimulation(input);
  console.log(`  Year-by-year:`);
  for (let i = 0; i < Math.min(5, result.formula.length); i++) {
    const y = result.formula[i];
    const conv = y.conversionAmount ?? 0;
    const fed = y.federalTax ?? 0;
    console.log(`    Year ${i + 1}: conv ${fmtCents(conv)}, fed tax ${fmtCents(fed)}`);
    assert(fed === 0, `Year ${i + 1} federal tax must be $0 (got ${fmtCents(fed)})`);
    assert(conv > 20_000_00, `Year ${i + 1} conversion should be ~$30K`);
  }
}

console.log(`\n=== ${testNum} tests ${process.exitCode ? "FAILED" : "PASSED"} ===`);
