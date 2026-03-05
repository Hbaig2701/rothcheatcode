/**
 * Tests for year-by-year non-SSI income lookup in calculation engines.
 * Run with: npx tsx lib/calculations/__tests__/income-lookup.test.ts
 */

// Use relative imports to avoid @/ alias issues with tsx
import { getNonSSIIncomeForYear } from '../utils/income';
import { runGrowthFormulaScenario } from '../scenarios/growth-formula';
import { runFormulaScenario } from '../scenarios/formula';
import { runBaselineScenario } from '../scenarios/baseline';
import type { Client } from '../../types/client';

// Minimal client factory for testing
function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'test-id',
    user_id: 'test-user',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    blueprint_type: 'fia',
    filing_status: 'married_filing_jointly',
    name: 'Test Client',
    age: 62,
    spouse_name: 'Spouse',
    spouse_age: 62,
    qualified_account_value: 166500000, // $1,665,000 in cents
    carrier_name: 'Test',
    product_name: 'Test FIA',
    bonus_percent: 0,
    rate_of_return: 7,
    anniversary_bonus_percent: null,
    anniversary_bonus_years: null,
    state: 'TX', // No state tax
    constraint_type: 'bracket_ceiling',
    tax_rate: 24,
    max_tax_rate: 24,
    tax_payment_source: 'from_taxable',
    state_tax_rate: 0,
    gross_taxable_non_ssi: 0,
    tax_exempt_non_ssi: 0,
    ssi_payout_age: 67,
    ssi_annual_amount: 2400000,
    spouse_ssi_payout_age: 67,
    spouse_ssi_annual_amount: 2400000,
    non_ssi_income: [],
    conversion_type: 'optimized_amount',
    fixed_conversion_amount: null,
    protect_initial_premium: false,
    withdrawal_type: 'no_withdrawals',
    payout_type: 'individual',
    income_start_age: 65,
    guaranteed_rate_of_return: 7,
    roll_up_option: null,
    payout_option: null,
    gi_conversion_years: 5,
    gi_conversion_bracket: 24,
    surrender_years: 10,
    surrender_schedule: null,
    penalty_free_percent: 10,
    baseline_comparison_rate: 7,
    post_contract_rate: 5,
    years_to_defer_conversion: 0,
    end_age: 100,
    heir_tax_rate: 40,
    widow_analysis: false,
    rmd_treatment: 'reinvested',
    date_of_birth: null,
    spouse_dob: null,
    life_expectancy: null,
    traditional_ira: 0,
    roth_ira: 0,
    taxable_accounts: 0,
    other_retirement: 0,
    federal_bracket: '24',
    include_niit: false,
    include_aca: false,
    ss_self: 0,
    ss_spouse: 0,
    pension: 0,
    other_income: 0,
    ss_start_age: 67,
    strategy: 'moderate',
    start_age: 62,
    growth_rate: 7,
    inflation_rate: 2.5,
    heir_bracket: '40',
    projection_years: 38,
    sensitivity: false,
    ...overrides,
  } as Client;
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${msg}`);
  }
}

// ============================================================
// Test 1: getNonSSIIncomeForYear utility
// ============================================================
console.log('=== Test 1: getNonSSIIncomeForYear utility ===');

const clientWithTable = makeClient({
  non_ssi_income: [
    { year: 2026, age: '62/62', gross_taxable: 10000000, tax_exempt: 0 },
    { year: 2027, age: '63/63', gross_taxable: 10000000, tax_exempt: 0 },
    { year: 2028, age: '64/64', gross_taxable: 10000000, tax_exempt: 0 },
    { year: 2029, age: '65/65', gross_taxable: 10000000, tax_exempt: 0 },
    { year: 2030, age: '66/66', gross_taxable: 10000000, tax_exempt: 0 },
  ],
  gross_taxable_non_ssi: 5000000, // Should be ignored when table has entries
});

assert(getNonSSIIncomeForYear(clientWithTable, 2026) === 10000000, 'Year 2026 should be $100K from table');
assert(getNonSSIIncomeForYear(clientWithTable, 2030) === 10000000, 'Year 2030 should be $100K from table');
assert(getNonSSIIncomeForYear(clientWithTable, 2031) === 0, 'Year 2031 (not in table) should be $0');
assert(getNonSSIIncomeForYear(clientWithTable, 2035) === 0, 'Year 2035 (not in table) should be $0');
console.log('  Done.');

// ============================================================
// Test 2: Flat field fallback
// ============================================================
console.log('=== Test 2: Flat field fallback ===');

const clientFlat = makeClient({
  non_ssi_income: [],
  gross_taxable_non_ssi: 5000000,
});

assert(getNonSSIIncomeForYear(clientFlat, 2026) === 5000000, 'Should use flat field when table empty');
assert(getNonSSIIncomeForYear(clientFlat, 2050) === 5000000, 'Should use flat field for any year');

const clientNoIncome = makeClient({
  non_ssi_income: [],
  gross_taxable_non_ssi: 0,
});
assert(getNonSSIIncomeForYear(clientNoIncome, 2026) === 0, 'Should be $0 when both are 0');
console.log('  Done.');

// ============================================================
// Test 3: Growth Formula - income table reduces conversions
// ============================================================
console.log('=== Test 3: Growth Formula with income table ===');

const clientGrowthWithIncome = makeClient({
  non_ssi_income: [
    { year: 2026, age: '62/62', gross_taxable: 10000000, tax_exempt: 0 },
    { year: 2027, age: '63/63', gross_taxable: 10000000, tax_exempt: 0 },
    { year: 2028, age: '64/64', gross_taxable: 10000000, tax_exempt: 0 },
    { year: 2029, age: '65/65', gross_taxable: 10000000, tax_exempt: 0 },
    { year: 2030, age: '66/66', gross_taxable: 10000000, tax_exempt: 0 },
  ],
});

const clientGrowthNoIncome = makeClient({
  non_ssi_income: [],
  gross_taxable_non_ssi: 0,
});

const resultsWithIncome = runGrowthFormulaScenario(clientGrowthWithIncome, 2026, 10);
const resultsNoIncome = runGrowthFormulaScenario(clientGrowthNoIncome, 2026, 10);

const year1With = resultsWithIncome[0];
const year1No = resultsNoIncome[0];

console.log(`  2026 w/ $100K income: conversion = $${(year1With.conversionAmount / 100).toLocaleString()}`);
console.log(`  2026 w/o income:      conversion = $${(year1No.conversionAmount / 100).toLocaleString()}`);

assert(
  year1With.conversionAmount < year1No.conversionAmount,
  `With income ($${year1With.conversionAmount/100}) should be less than without ($${year1No.conversionAmount/100})`
);

// Difference should be ~$70K (100K income - ~30K deduction)
const diff = year1No.conversionAmount - year1With.conversionAmount;
console.log(`  Difference: $${(diff / 100).toLocaleString()} (expected ~$70K)`);
assert(diff > 6000000 && diff < 8000000, `Diff should be ~$70K, got $${diff/100}`);

// 2031 (year 6) - no income entry, should have full bracket room
const year6With = resultsWithIncome[5];
console.log(`  2031 income table client: conversion = $${(year6With.conversionAmount / 100).toLocaleString()}, otherIncome = $${(year6With.otherIncome / 100).toLocaleString()}`);
assert(year6With.otherIncome === 0, `2031 otherIncome should be $0 (no table entry), got $${year6With.otherIncome/100}`);
console.log('  Done.');

// ============================================================
// Test 4: Formula scenario - income table reduces conversions
// ============================================================
console.log('=== Test 4: Formula scenario with income table ===');

const formulaWith = runFormulaScenario(clientGrowthWithIncome, 2026, 10);
const formulaNo = runFormulaScenario(clientGrowthNoIncome, 2026, 10);

console.log(`  2026 w/ $100K: conversion = $${(formulaWith[0].conversionAmount / 100).toLocaleString()}`);
console.log(`  2026 w/o:      conversion = $${(formulaNo[0].conversionAmount / 100).toLocaleString()}`);
assert(formulaWith[0].conversionAmount < formulaNo[0].conversionAmount, 'Formula: With income should convert less');

// Check year 6 has no income
assert(formulaWith[5].otherIncome === 0, 'Formula: 2031 should have $0 otherIncome');
console.log('  Done.');

// ============================================================
// Test 5: Baseline scenario - income table affects calculations
// ============================================================
console.log('=== Test 5: Baseline scenario with income table ===');

const baselineWith = runBaselineScenario(clientGrowthWithIncome, 2026, 10);
const baselineNo = runBaselineScenario(clientGrowthNoIncome, 2026, 10);

console.log(`  2026 w/ $100K: otherIncome = $${(baselineWith[0].otherIncome / 100).toLocaleString()}`);
console.log(`  2026 w/o:      otherIncome = $${(baselineNo[0].otherIncome / 100).toLocaleString()}`);

assert(baselineWith[0].otherIncome === 10000000, `Baseline 2026 otherIncome should be $100K, got $${baselineWith[0].otherIncome/100}`);
assert(baselineNo[0].otherIncome === 0, `Baseline 2026 no-income otherIncome should be $0`);
assert(baselineWith[5].otherIncome === 0, `Baseline 2031 otherIncome should be $0 (no entry)`);
console.log('  Done.');

// ============================================================
// Test 6: Edge case - $500K income exceeds 24% bracket ceiling
// ============================================================
console.log('=== Test 6: Income exceeding bracket ceiling ===');

const clientHugeIncome = makeClient({
  non_ssi_income: [
    { year: 2026, age: '62/62', gross_taxable: 50000000, tax_exempt: 0 }, // $500K
  ],
});

const hugeIncomeResult = runGrowthFormulaScenario(clientHugeIncome, 2026, 3);
console.log(`  2026 ($500K income): conversion = $${(hugeIncomeResult[0].conversionAmount / 100).toLocaleString()}`);
console.log(`  2027 (no entry):     conversion = $${(hugeIncomeResult[1].conversionAmount / 100).toLocaleString()}`);

// $500K - ~$30K deduction = ~$470K taxable income, well above 24% ceiling (~$403K)
assert(hugeIncomeResult[0].conversionAmount === 0, 'With $500K income, no room in 24% bracket');
assert(hugeIncomeResult[1].conversionAmount > 0, 'Year 2 with no income should have room');
console.log('  Done.');

// ============================================================
// Test 7: Edge case - varying income amounts per year
// ============================================================
console.log('=== Test 7: Varying income amounts per year ===');

const clientVarying = makeClient({
  non_ssi_income: [
    { year: 2026, age: '62', gross_taxable: 20000000, tax_exempt: 0 }, // $200K
    { year: 2027, age: '63', gross_taxable: 5000000, tax_exempt: 0 },  // $50K
    { year: 2028, age: '64', gross_taxable: 0, tax_exempt: 0 },         // $0
  ],
});

const varyingResult = runGrowthFormulaScenario(clientVarying, 2026, 5);
console.log(`  2026 ($200K): conv = $${(varyingResult[0].conversionAmount / 100).toLocaleString()}, other = $${(varyingResult[0].otherIncome / 100).toLocaleString()}`);
console.log(`  2027 ($50K):  conv = $${(varyingResult[1].conversionAmount / 100).toLocaleString()}, other = $${(varyingResult[1].otherIncome / 100).toLocaleString()}`);
console.log(`  2028 ($0):    conv = $${(varyingResult[2].conversionAmount / 100).toLocaleString()}, other = $${(varyingResult[2].otherIncome / 100).toLocaleString()}`);
console.log(`  2029 (none):  conv = $${(varyingResult[3].conversionAmount / 100).toLocaleString()}, other = $${(varyingResult[3].otherIncome / 100).toLocaleString()}`);

// Conversions should increase as income decreases
assert(varyingResult[0].conversionAmount < varyingResult[1].conversionAmount, '$200K year should have less room than $50K year');
assert(varyingResult[1].conversionAmount < varyingResult[2].conversionAmount, '$50K year should have less room than $0 year');
assert(varyingResult[0].otherIncome === 20000000, '2026 should show $200K');
assert(varyingResult[1].otherIncome === 5000000, '2027 should show $50K');
assert(varyingResult[2].otherIncome === 0, '2028 should show $0 (table entry with 0)');
assert(varyingResult[3].otherIncome === 0, '2029 should show $0 (no table entry)');
console.log('  Done.');

// ============================================================
// Summary
// ============================================================
console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  process.exit(1);
}
