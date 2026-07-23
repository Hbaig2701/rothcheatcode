/**
 * Headline-number fixture tests.
 *
 * Run with: npx tsx lib/calculations/__tests__/report-fixtures.test.ts
 *
 * What this is:
 *   Three real-shape fixture clients (single + simple, single + complex,
 *   MFJ + complex) with LOCKED expected values for every headline number
 *   on the production reports (Lifetime Wealth, Tax on RMDs, Tax on
 *   Conversions, Forced Distributions, Net Legacy, etc.).
 *
 * Why it exists:
 *   Without these locks, "well-intentioned" calculation refactors silently
 *   move the numbers advisors see on reports. The May 1 "Tax on RMDs"
 *   change (commit 140e319) moved the summary value from $595K to $245K
 *   for Paul George without anyone noticing — Jorge filed a ticket two
 *   weeks later. With these tests, that commit would have failed CI on
 *   the assertion below and forced a deliberate decision.
 *
 * How to use it:
 *   - When you intentionally change a calculation, run the test, see
 *     which assertions fail, update the expected values, and update
 *     REPORT_SPEC.md in the same commit so the change is documented.
 *   - When an assertion fails unexpectedly, do NOT just update the
 *     expected value to make it green. The test caught real drift —
 *     find what changed and decide whether to keep it.
 *
 * Source-of-truth formulas live in REPORT_SPEC.md. Any divergence
 * between this test and the spec is a bug in one or the other.
 */

// Use relative imports to avoid @/ alias issues with tsx
import type { Client } from '../../types/client';
import { runSimulationWithMetrics } from '../engine';
import { calculateFederalTax, calculateTaxableIncome } from '../modules/federal-tax';
import { calculateStateTax } from '../modules/state-tax';
import { computeTaxableIncomeWithSS } from '../tax-helpers';
import { getStandardDeduction } from '../../data/standard-deductions';
// Production helper that the dashboard + PDF route now both call. The test's
// inline canonicalTaxOnRMDs is an independent re-derivation; a separate
// assertion below checks the helper's output matches that independent value.
// If those two ever disagree, somebody refactored the helper and broke it.
import { computeMarginalRMDTax } from '../marginal-rmd-tax';

// ============================================================
// Helpers
// ============================================================

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assertDollars(actual: number, expected: number, msg: string) {
  // Engine produces integer cents. Allow zero tolerance — golden tests
  // catch drift, not approximation. If the engine genuinely needs to
  // change, update the expected value deliberately.
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    const diff = actual - expected;
    failures.push(`  FAIL: ${msg}\n    expected: ${expected} (${(expected / 100).toFixed(2)})\n    actual:   ${actual} (${(actual / 100).toFixed(2)})\n    drift:    ${diff > 0 ? '+' : ''}${diff} cents (${(diff / 100).toFixed(2)})`);
  }
}

// Canonical formulas — these mirror REPORT_SPEC.md §2. Any divergence
// between these and the production code (growth-report-dashboard.tsx,
// generate-pdf/route.ts, etc.) is the regression we're trying to catch.

function canonicalLifetimeWealth(
  finalNetWorth: number,
  finalTraditional: number,
  heirTaxRate: number,
): number {
  const heirTax = Math.round(finalTraditional * heirTaxRate);
  return finalNetWorth - heirTax;
}

function canonicalForcedDistributions(years: { rmdAmount?: number }[]): number {
  return years.reduce((s, y) => s + (y.rmdAmount ?? 0), 0);
}

function canonicalTotalFedStateTax(years: { federalTax?: number; stateTax?: number }[]): number {
  return years.reduce((s, y) => s + (y.federalTax ?? 0) + (y.stateTax ?? 0), 0);
}

function canonicalTaxOnConversions(
  years: { federalTaxOnConversions?: number; stateTaxOnConversions?: number }[],
): number {
  return years.reduce(
    (s, y) => s + (y.federalTaxOnConversions ?? 0) + (y.stateTaxOnConversions ?? 0),
    0,
  );
}

// Marginal RMD tax — duplicates the implementation in
// app/api/generate-pdf/route.ts:computeMarginalRMDTax. Kept inline so a
// change to that helper requires also updating this test (and the spec).
function canonicalTaxOnRMDs(years: Array<{
  rmdAmount?: number;
  federalTax?: number;
  stateTax?: number;
  otherIncome?: number;
  conversionAmount?: number;
  ssIncome?: number;
  standardDeduction?: number;
  age: number;
  spouseAge?: number | null;
  year: number;
}>, client: Client): number {
  const stateOverride = client.state_tax_rate != null ? client.state_tax_rate / 100 : undefined;
  let total = 0;
  for (const y of years) {
    const rmd = y.rmdAmount ?? 0;
    if (rmd <= 0) continue;
    const taxWith = (y.federalTax ?? 0) + (y.stateTax ?? 0);
    const deductions = y.standardDeduction
      ?? getStandardDeduction(client.filing_status, y.age, y.spouseAge ?? undefined, y.year);
    // Isolate the RMD's marginal tax by keeping any Roth conversion IN the
    // "no-RMD" baseline (same definition the production computeMarginalRMDTax
    // helper uses) — otherwise a strategy year with both an RMD and a
    // conversion misattributes the conversion's tax to "Tax on RMDs".
    const noRMD = computeTaxableIncomeWithSS({
      otherIncome: (y.otherIncome ?? 0) + (y.conversionAmount ?? 0),
      ssBenefits: y.ssIncome ?? 0,
      taxExemptInterest: client.tax_exempt_non_ssi ?? 0,
      deductions,
      filingStatus: client.filing_status,
      age: y.age,
      spouseAge: y.spouseAge ?? undefined,
      taxYear: y.year,
    });
    const fedNo = calculateFederalTax({
      taxableIncome: noRMD.taxableIncome,
      filingStatus: client.filing_status,
      taxYear: y.year,
    }).totalTax;
    const stateNo = calculateStateTax({
      taxableIncome: noRMD.taxableIncome,
      state: client.state,
      filingStatus: client.filing_status,
      overrideRate: stateOverride,
    }).totalTax;
    total += Math.max(0, taxWith - (fedNo + stateNo));
  }
  return total;
}

// Minimal client factory — keeps each fixture readable by listing only
// the fields that differ from the defaults below.
function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'fixture',
    user_id: 'fixture',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    blueprint_type: 'fia',
    custom_product_id: null,
    scenario_name: null,
    filing_status: 'single',
    name: 'Fixture',
    age: 65,
    spouse_name: null,
    spouse_age: null,
    qualified_account_value: 50_000_000,
    carrier_name: 'Test',
    product_name: 'Test',
    bonus_percent: 0,
    rate_of_return: 6,
    anniversary_bonus_percent: null,
    anniversary_bonus_years: null,
    state: 'TX',
    // Legacy 'none' migrated to 'bracket_ceiling' 2026-06-05 — behavior
    // identical (engine only ever read 'irmaa_threshold' for this field).
    constraint_type: 'bracket_ceiling',
    tax_rate: 22,
    max_tax_rate: 24,
    tax_payment_source: 'from_taxable',
    state_tax_rate: null,
    gross_taxable_non_ssi: 0,
    tax_exempt_non_ssi: 0,
    ssi_payout_age: 67,
    ssi_annual_amount: 0,
    spouse_ssi_payout_age: null,
    spouse_ssi_annual_amount: null,
    non_ssi_income: [],
    withdrawals: [],
    conversion_type: 'optimized_amount',
    fixed_conversion_amount: null,
    target_partial_amount: null,
    respect_penalty_free_limit: false,
    protect_initial_premium: false,
    withdrawal_type: 'no_withdrawals',
    payout_type: 'individual',
    income_start_age: 67,
    guaranteed_rate_of_return: 6,
    roll_up_option: null,
    payout_option: null,
    gi_conversion_years: 5,
    gi_conversion_bracket: 24,
    surrender_years: 7,
    surrender_schedule: null,
    penalty_free_percent: 10,
    baseline_comparison_rate: 6,
    post_contract_rate: 5,
    years_to_defer_conversion: 0,
    end_age: 90,
    heir_tax_rate: 40,
    widow_analysis: false,
    widow_death_age: null,
    rmd_treatment: 'reinvested',
    aum_allocation_percent: 0,
    aum_fee_percent: 1,
    aum_dividend_yield: 2,
    aum_turnover_percent: 10,
    aum_withdrawal_years: 5,
    ltcg_rate: 15,
    date_of_birth: null,
    spouse_dob: null,
    life_expectancy: null,
    traditional_ira: 0,
    roth_ira: 0,
    taxable_accounts: 0,
    other_retirement: 0,
    federal_bracket: '22',
    include_niit: false,
    include_aca: false,
    ss_self: 0,
    ss_spouse: 0,
    pension: 0,
    other_income: 0,
    ss_start_age: 67,
    strategy: 'moderate',
    start_age: 65,
    growth_rate: 6,
    inflation_rate: 2.5,
    heir_bracket: '40',
    projection_years: 25,
    sensitivity: false,
    ...overrides,
  } as Client;
}

function runFixture(label: string, client: Client) {
  console.log(`\n=== ${label} ===`);
  const currentYear = new Date().getFullYear();
  const projectionYears = client.end_age - client.age;
  const { result } = runSimulationWithMetrics({
    client,
    startYear: currentYear,
    endYear: currentYear + projectionYears,
  });
  const heirTaxRate = (client.heir_tax_rate ?? 40) / 100;

  const baseFinal = result.baseline[result.baseline.length - 1];
  const blueFinal = result.formula[result.formula.length - 1];

  return {
    base: {
      finalNetWorth: baseFinal.netWorth,
      finalTraditional: baseFinal.traditionalBalance,
      finalRoth: baseFinal.rothBalance,
      finalTaxable: baseFinal.taxableBalance,
      lifetimeWealth: canonicalLifetimeWealth(baseFinal.netWorth, baseFinal.traditionalBalance, heirTaxRate),
      forcedDistributions: canonicalForcedDistributions(result.baseline),
      totalFedStateTax: canonicalTotalFedStateTax(result.baseline),
      taxOnRMDs: canonicalTaxOnRMDs(result.baseline, client),
    },
    blue: {
      finalNetWorth: blueFinal.netWorth,
      finalTraditional: blueFinal.traditionalBalance,
      finalRoth: blueFinal.rothBalance,
      finalTaxable: blueFinal.taxableBalance,
      lifetimeWealth: canonicalLifetimeWealth(blueFinal.netWorth, blueFinal.traditionalBalance, heirTaxRate),
      taxOnConversions: canonicalTaxOnConversions(result.formula),
      totalFedStateTax: canonicalTotalFedStateTax(result.formula),
      taxOnRMDs: canonicalTaxOnRMDs(result.formula, client),
    },
    // Production helper output, used to assert the helper agrees with the
    // independent canonical re-derivation above. See block at the bottom.
    helperBaseTaxOnRMDs: computeMarginalRMDTax(result.baseline, client),
    helperBlueTaxOnRMDs: computeMarginalRMDTax(result.formula, client),
  };
}

// ============================================================
// FIXTURE 1: Ray Fucci shape
//   Single, age 74, no state tax, almost no SS, fixed_amount conversions.
//   Simple tax picture — Tax on RMDs ≈ Total Tax (the "matching" case
//   that confused Jorge into thinking Paul George was broken).
// ============================================================

const fucci = makeClient({
  name: 'Fucci-shape (single, no state tax, low SS)',
  filing_status: 'single',
  age: 74,
  end_age: 95,
  state: 'TX',
  state_tax_rate: null,
  qualified_account_value: 89_000_000, // $890K
  bonus_percent: 0,
  rate_of_return: 6,
  baseline_comparison_rate: 6,
  ssi_payout_age: 67,
  ssi_annual_amount: 316_600, // ~$3.2K/yr
  conversion_type: 'fixed_amount',
  fixed_conversion_amount: 5_000_000, // $50K/yr
  tax_payment_source: 'from_taxable',
  taxable_accounts: 5_000_000,
  max_tax_rate: 22,
  tax_rate: 22,
});

const fucciResults = runFixture('FIXTURE 1 — Fucci shape', fucci);

// Expected values are LOCKED — captured 2026-05-14 against the engine
// at commit 53e86a2. All values in cents (engine native).
//
// When you intentionally change a calculation that moves these:
//   1. Update REPORT_SPEC.md so the change is documented.
//   2. Run this test, copy the new actuals from the scratchpad output
//      at the bottom, and paste them in here.
//   3. Reference the spec change in the commit message.
//
// When a value drifts unexpectedly: do NOT just paste in to make green.
// Investigate first.
const FUCCI_EXPECTED = {
  // RE-LOCKED 2026-07-15 (OBBA senior deduction): Fucci is single, age 65+, so
  // the new $6,000 OBBA senior bonus deduction (2025–2028) reduces taxable
  // income → less tax, more retained wealth. base tax dropped $2,160; net worth
  // rose accordingly. Also fixes a PRE-EXISTING helper≠canonical failure in the
  // strategy taxOnRMDs (see blue note).
  base: {
    finalNetWorth:        308_863_272,
    finalTraditional:      70_671_550,
    finalRoth:                      0,
    finalTaxable:         238_191_722,
    lifetimeWealth:       280_594_652,
    forcedDistributions:  132_258_417,
    totalFedStateTax:       9_175_687,
    taxOnRMDs:              9_175_687,
  },
  blue: {
    finalNetWorth:        304_368_319,
    finalTraditional:               0,
    finalRoth:            205_852_525,
    finalTaxable:          98_199_012,
    lifetimeWealth:       304_368_319,
    taxOnConversions:      10_585_149,
    totalFedStateTax:      11_840_484,
    // taxOnRMDs is now the MARGINAL RMD tax (conversion held in the no-RMD
    // baseline), matching the production computeMarginalRMDTax helper. The old
    // lock (12_324_519) was the buggy canonical value that folded conversion
    // tax into RMD tax — the helper never matched it (this assertion was
    // failing pre-change). Now helper ≡ canonical = 6_287_679. The senior
    // deduction itself moved the helper only ~$1,293 (6_454_022 → 6_287_679).
    taxOnRMDs:              6_287_679,
  },
};

assertDollars(fucciResults.base.finalNetWorth, FUCCI_EXPECTED.base.finalNetWorth, 'Fucci base.finalNetWorth');
assertDollars(fucciResults.base.finalTraditional, FUCCI_EXPECTED.base.finalTraditional, 'Fucci base.finalTraditional');
assertDollars(fucciResults.base.finalRoth, FUCCI_EXPECTED.base.finalRoth, 'Fucci base.finalRoth');
assertDollars(fucciResults.base.finalTaxable, FUCCI_EXPECTED.base.finalTaxable, 'Fucci base.finalTaxable');
assertDollars(fucciResults.base.lifetimeWealth, FUCCI_EXPECTED.base.lifetimeWealth, 'Fucci base.lifetimeWealth');
assertDollars(fucciResults.base.forcedDistributions, FUCCI_EXPECTED.base.forcedDistributions, 'Fucci base.forcedDistributions');
assertDollars(fucciResults.base.totalFedStateTax, FUCCI_EXPECTED.base.totalFedStateTax, 'Fucci base.totalFedStateTax');
assertDollars(fucciResults.base.taxOnRMDs, FUCCI_EXPECTED.base.taxOnRMDs, 'Fucci base.taxOnRMDs');
assertDollars(fucciResults.blue.finalNetWorth, FUCCI_EXPECTED.blue.finalNetWorth, 'Fucci blue.finalNetWorth');
assertDollars(fucciResults.blue.finalTraditional, FUCCI_EXPECTED.blue.finalTraditional, 'Fucci blue.finalTraditional');
assertDollars(fucciResults.blue.finalRoth, FUCCI_EXPECTED.blue.finalRoth, 'Fucci blue.finalRoth');
assertDollars(fucciResults.blue.lifetimeWealth, FUCCI_EXPECTED.blue.lifetimeWealth, 'Fucci blue.lifetimeWealth');
assertDollars(fucciResults.blue.taxOnConversions, FUCCI_EXPECTED.blue.taxOnConversions, 'Fucci blue.taxOnConversions');
assertDollars(fucciResults.blue.totalFedStateTax, FUCCI_EXPECTED.blue.totalFedStateTax, 'Fucci blue.totalFedStateTax');
assertDollars(fucciResults.blue.taxOnRMDs, FUCCI_EXPECTED.blue.taxOnRMDs, 'Fucci blue.taxOnRMDs');
// Production helper must match the test's independent canonical re-derivation.
assertDollars(fucciResults.helperBaseTaxOnRMDs, FUCCI_EXPECTED.base.taxOnRMDs, 'Fucci helperBaseTaxOnRMDs (helper vs canonical)');
assertDollars(fucciResults.helperBlueTaxOnRMDs, FUCCI_EXPECTED.blue.taxOnRMDs, 'Fucci helperBlueTaxOnRMDs (helper vs canonical)');

// ============================================================
// FIXTURE 2: Paul George shape
//   Single, age 77, MA (5% state), $25K SS, fixed_amount conversions.
//   Complex tax picture — Tax on RMDs ≠ Total Tax. The case where the
//   Tax on RMDs marginal calc diverges materially from year-by-year
//   total. Locking this guards Jorge's whole confusion thread.
// ============================================================

const paul = makeClient({
  name: 'Paul-shape (single, MA state tax, $25K SS)',
  filing_status: 'single',
  age: 77,
  end_age: 98,
  state: 'MA',
  state_tax_rate: 5.0,
  qualified_account_value: 58_500_000, // $585K
  bonus_percent: 22,
  rate_of_return: 6,
  baseline_comparison_rate: 6,
  ssi_payout_age: 67,
  ssi_annual_amount: 2_500_000, // $25K/yr
  conversion_type: 'fixed_amount',
  fixed_conversion_amount: 5_000_000, // $50K/yr
  tax_payment_source: 'from_ira',
  taxable_accounts: 0,
  max_tax_rate: 22,
  tax_rate: 22,
});

const paulResults = runFixture('FIXTURE 2 — Paul George shape', paul);

const PAUL_EXPECTED = {
  // RE-LOCKED 2026-07-15 (OBBA senior deduction): Paul is single, age 77, so the
  // $6,000 OBBA senior bonus deduction applies. base tax dropped $3,056; net
  // worth/wealth rose accordingly. Also fixes the pre-existing helper≠canonical
  // strategy taxOnRMDs failure (see blue note).
  base: {
    finalNetWorth:        177_758_154,
    finalTraditional:      34_875_030,
    finalRoth:                      0,
    finalTaxable:         142_883_124,
    lifetimeWealth:       163_808_142,
    forcedDistributions:   91_532_668,
    totalFedStateTax:      13_534_537,
    taxOnRMDs:             13_534_537,
  },
  blue: {
    finalNetWorth:        205_693_685,
    finalTraditional:               0, // floored from -$14.72 (negative-IRA residual; see formula.ts iraAfterConversion floor)
    finalRoth:            174_953_271,
    finalTaxable:          26_590_270,
    lifetimeWealth:       205_693_685,
    taxOnConversions:      16_630_495,
    totalFedStateTax:      18_703_682,
    // taxOnRMDs is the MARGINAL RMD tax (conversion held in the no-RMD
    // baseline), matching the production computeMarginalRMDTax helper. It is
    // correctly LESS than totalFedStateTax (which includes conversion tax) — the
    // old lock (20_828_449, "== totalFedStateTax") was the buggy canonical that
    // folded conversion tax into RMD tax; the helper never matched it (this
    // assertion was failing pre-change). Now helper ≡ canonical = 7_408_306. The
    // senior deduction moved the helper only ~$1,479 (7_735_927 → 7_408_306).
    taxOnRMDs:              7_408_306,
  },
};

assertDollars(paulResults.base.finalNetWorth, PAUL_EXPECTED.base.finalNetWorth, 'Paul base.finalNetWorth');
assertDollars(paulResults.base.finalTraditional, PAUL_EXPECTED.base.finalTraditional, 'Paul base.finalTraditional');
assertDollars(paulResults.base.finalRoth, PAUL_EXPECTED.base.finalRoth, 'Paul base.finalRoth');
assertDollars(paulResults.base.finalTaxable, PAUL_EXPECTED.base.finalTaxable, 'Paul base.finalTaxable');
assertDollars(paulResults.base.lifetimeWealth, PAUL_EXPECTED.base.lifetimeWealth, 'Paul base.lifetimeWealth');
assertDollars(paulResults.base.forcedDistributions, PAUL_EXPECTED.base.forcedDistributions, 'Paul base.forcedDistributions');
assertDollars(paulResults.base.totalFedStateTax, PAUL_EXPECTED.base.totalFedStateTax, 'Paul base.totalFedStateTax');
assertDollars(paulResults.base.taxOnRMDs, PAUL_EXPECTED.base.taxOnRMDs, 'Paul base.taxOnRMDs');
assertDollars(paulResults.blue.finalNetWorth, PAUL_EXPECTED.blue.finalNetWorth, 'Paul blue.finalNetWorth');
assertDollars(paulResults.blue.finalTraditional, PAUL_EXPECTED.blue.finalTraditional, 'Paul blue.finalTraditional');
assertDollars(paulResults.blue.finalRoth, PAUL_EXPECTED.blue.finalRoth, 'Paul blue.finalRoth');
assertDollars(paulResults.blue.lifetimeWealth, PAUL_EXPECTED.blue.lifetimeWealth, 'Paul blue.lifetimeWealth');
assertDollars(paulResults.blue.taxOnConversions, PAUL_EXPECTED.blue.taxOnConversions, 'Paul blue.taxOnConversions');
assertDollars(paulResults.blue.totalFedStateTax, PAUL_EXPECTED.blue.totalFedStateTax, 'Paul blue.totalFedStateTax');
assertDollars(paulResults.blue.taxOnRMDs, PAUL_EXPECTED.blue.taxOnRMDs, 'Paul blue.taxOnRMDs');
assertDollars(paulResults.helperBaseTaxOnRMDs, PAUL_EXPECTED.base.taxOnRMDs, 'Paul helperBaseTaxOnRMDs (helper vs canonical)');
assertDollars(paulResults.helperBlueTaxOnRMDs, PAUL_EXPECTED.blue.taxOnRMDs, 'Paul helperBlueTaxOnRMDs (helper vs canonical)');

// ============================================================
// FIXTURE 3: Sprengel shape
//   MFJ, age 55, WI (7.65% state), full conversion in year 1, both
//   spouses with SS, recurring annuity income, scheduled withdrawals.
//   Largest engine surface — exercises full conversion gross-up + WI
//   state tax + dual-SS phasing.
// ============================================================

const sprengel = makeClient({
  name: 'Sprengel-shape (MFJ, WI, full conversion, recurring income)',
  filing_status: 'married_filing_jointly',
  age: 55,
  spouse_name: 'Spouse',
  spouse_age: 49,
  end_age: 90,
  state: 'WI',
  state_tax_rate: 7.65,
  qualified_account_value: 160_000_000, // $1.6M
  bonus_percent: 0,
  rate_of_return: 6,
  baseline_comparison_rate: 6,
  ssi_payout_age: 67,
  ssi_annual_amount: 6_219_900, // $62,199
  spouse_ssi_payout_age: 67,
  spouse_ssi_annual_amount: 6_000_000, // $60,000
  non_ssi_income: Array.from({ length: 24 }, (_, i) => ({
    age: `${67 + i}/${61 + i}`,
    type: 'other' as const,
    year: 2038 + i,
    tax_exempt: 0,
    gross_taxable: 10_000_000, // $100K/yr
  })),
  withdrawals: Array.from({ length: 24 }, (_, i) => ({
    age: 67 + i,
    year: 2038 + i,
    amount: 10_000_000,
    source: 'ira' as const,
  })),
  conversion_type: 'full_conversion',
  fixed_conversion_amount: null,
  tax_payment_source: 'from_ira',
  taxable_accounts: 0,
  max_tax_rate: 37,
  tax_rate: 24,
  widow_analysis: true,
  widow_death_age: null,
});

const sprengelResults = runFixture('FIXTURE 3 — Sprengel shape', sprengel);

const SPRENGEL_EXPECTED = {
  // Sprengel is the only fixture with a voluntary IRA withdrawal schedule
  // ($100K/yr from age 67), so it's the only one affected by the RMD-
  // satisfaction fix: voluntary IRA pulls now satisfy the RMD up to their
  // amount (matches IRS rule) instead of stacking on top of it. Result: less
  // IRA pulled per year → more Traditional balance preserved → less
  // reinvested into Taxable → less taxable income → less tax. Forced RMD
  // requirements themselves grow because the IRA depletes slower (BOY
  // balance is higher each year, so the calculated RMD is higher).
  base: {
    // RE-LOCKED 2026-06-29 (audit F5). The BASELINE moved (finalTaxable +$1.44M)
    // even though it has no conversions — explained by commit 9396e3a
    // "reinvested RMDs accumulate in taxable account" (plus 4fbb38d voluntary-
    // satisfies-RMD and the 1960+ RMD-age fix). finalTraditional / forced-
    // Distributions are unchanged, consistent with a reinvestment-side change.
    // finalNetWorth/finalTaxable/lifetimeWealth re-locked v71 (2026-07-05):
    // IRMAA 2026 brackets corrected (Lori Avant). Sprengel's baseline MAGI stays
    // above the raised thresholds, so the higher 2026 surcharges add ~$2,340 of
    // lifetime IRMAA drag → net worth −$233,985 cents (648,268,744 → 648,034,759).
    finalNetWorth:        648_034_759,
    finalTraditional:     401_190_516,
    finalRoth:                      0,
    finalTaxable:         246_844_243,
    lifetimeWealth:       487_558_553,
    forcedDistributions:  396_578_978,
    totalFedStateTax:     191_368_364,
    taxOnRMDs:            111_048_140,
  },
  blue: {
    // finalTraditional was -$22,971 (a NEGATIVE IRA balance) before the
    // formula.ts `iraAfterConversion` floor was added — a residual-compounding
    // bug (Kwanza-class) that growth-formula.ts already guarded against but
    // formula.ts did not. Floored to $0; finalNetWorth and lifetimeWealth rise
    // by that $22,971 accordingly. (Found via self-audit during the Joshua
    // Williamson penalty-free-cap fix.)
    // RE-LOCKED 2026-06-29 (audit F5). Strategy Roth DROPPED $1.6M and
    // taxOnConversions dropped $88K — both the expected signature of v66's
    // self-consistent gross-up: paying conversion tax from the IRA now consumes
    // more IRA per dollar converted, so less reaches the Roth. finalTraditional
    // still floors to 0 (full conversion drains) and taxOnRMDs stays exactly 0.
    finalNetWorth:        796_236_482,
    finalTraditional:               0,
    finalRoth:            796_236_482,
    finalTaxable:                   0,
    lifetimeWealth:       796_236_482,
    taxOnConversions:      34_466_069,
    totalFedStateTax:     121_898_664,
    // Full conversion drains the Traditional IRA before age 73, so there are
    // no RMDs in the strategy phase — marginal RMD tax must be exactly $0.
    // If this ever shows non-zero, full-conversion semantics broke.
    taxOnRMDs:                      0,
  },
};

assertDollars(sprengelResults.base.finalNetWorth, SPRENGEL_EXPECTED.base.finalNetWorth, 'Sprengel base.finalNetWorth');
assertDollars(sprengelResults.base.finalTraditional, SPRENGEL_EXPECTED.base.finalTraditional, 'Sprengel base.finalTraditional');
assertDollars(sprengelResults.base.finalRoth, SPRENGEL_EXPECTED.base.finalRoth, 'Sprengel base.finalRoth');
assertDollars(sprengelResults.base.finalTaxable, SPRENGEL_EXPECTED.base.finalTaxable, 'Sprengel base.finalTaxable');
assertDollars(sprengelResults.base.lifetimeWealth, SPRENGEL_EXPECTED.base.lifetimeWealth, 'Sprengel base.lifetimeWealth');
assertDollars(sprengelResults.base.forcedDistributions, SPRENGEL_EXPECTED.base.forcedDistributions, 'Sprengel base.forcedDistributions');
assertDollars(sprengelResults.base.totalFedStateTax, SPRENGEL_EXPECTED.base.totalFedStateTax, 'Sprengel base.totalFedStateTax');
assertDollars(sprengelResults.base.taxOnRMDs, SPRENGEL_EXPECTED.base.taxOnRMDs, 'Sprengel base.taxOnRMDs');
assertDollars(sprengelResults.blue.finalNetWorth, SPRENGEL_EXPECTED.blue.finalNetWorth, 'Sprengel blue.finalNetWorth');
assertDollars(sprengelResults.blue.finalTraditional, SPRENGEL_EXPECTED.blue.finalTraditional, 'Sprengel blue.finalTraditional');
assertDollars(sprengelResults.blue.finalRoth, SPRENGEL_EXPECTED.blue.finalRoth, 'Sprengel blue.finalRoth');
assertDollars(sprengelResults.blue.lifetimeWealth, SPRENGEL_EXPECTED.blue.lifetimeWealth, 'Sprengel blue.lifetimeWealth');
assertDollars(sprengelResults.blue.taxOnConversions, SPRENGEL_EXPECTED.blue.taxOnConversions, 'Sprengel blue.taxOnConversions');
assertDollars(sprengelResults.blue.totalFedStateTax, SPRENGEL_EXPECTED.blue.totalFedStateTax, 'Sprengel blue.totalFedStateTax');
assertDollars(sprengelResults.blue.taxOnRMDs, SPRENGEL_EXPECTED.blue.taxOnRMDs, 'Sprengel blue.taxOnRMDs');
assertDollars(sprengelResults.helperBaseTaxOnRMDs, SPRENGEL_EXPECTED.base.taxOnRMDs, 'Sprengel helperBaseTaxOnRMDs (helper vs canonical)');
assertDollars(sprengelResults.helperBlueTaxOnRMDs, SPRENGEL_EXPECTED.blue.taxOnRMDs, 'Sprengel helperBlueTaxOnRMDs (helper vs canonical)');

// ============================================================
// SCRATCHPAD: print actuals so a developer who needs to update the
// locked values can copy/paste them.
//
// IMPORTANT: when assertions fail unexpectedly, do NOT just paste these
// in to make the test green. The failure caught real drift. Investigate
// the cause first; only update locks when the change is intentional and
// REPORT_SPEC.md has been updated.
// ============================================================

console.log('\n=== Actuals (for snapshot updates) ===');
console.log(JSON.stringify({
  fucci: fucciResults,
  paul: paulResults,
  sprengel: sprengelResults,
}, null, 2));

// ============================================================
// Results
// ============================================================

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  for (const f of failures) console.error(f);
  process.exit(1);
}
process.exit(0);
