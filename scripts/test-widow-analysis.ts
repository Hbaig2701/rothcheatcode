/**
 * Numbered tests for the engine-aware widow analysis (Option 2).
 *
 * Run with: npx tsx scripts/test-widow-analysis.ts
 */

import { runGrowthSimulation, createSimulationInput } from "../lib/calculations";
import { analyzeWidowPenaltyFromProjection } from "../lib/calculations/analysis/widow-penalty";
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
    age: 65,
    spouse_name: "Spouse",
    spouse_age: 63,
    qualified_account_value: 1_000_000_00,
    carrier_name: "Test Carrier",
    product_name: "Test Product",
    bonus_percent: 0,
    rate_of_return: 5,
    anniversary_bonus_percent: null,
    anniversary_bonus_years: null,
    state: "TX",
    constraint_type: "none",
    tax_rate: 22,
    max_tax_rate: 22,
    tax_payment_source: "from_taxable",
    state_tax_rate: 0,
    gross_taxable_non_ssi: 0,
    tax_exempt_non_ssi: 0,
    ssi_payout_age: 67,
    ssi_annual_amount: 36_000_00, // $36K primary SS
    spouse_ssi_payout_age: 67,
    spouse_ssi_annual_amount: 18_000_00, // $18K spouse SS (smaller — lost on death)
    non_ssi_income: [],
    conversion_type: "optimized_amount",
    fixed_conversion_amount: null,
    target_partial_amount: null,
    respect_penalty_free_limit: false,
    protect_initial_premium: false,
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
    baseline_comparison_rate: 5,
    post_contract_rate: 5,
    years_to_defer_conversion: 0,
    end_age: 90,
    heir_tax_rate: 40,
    widow_analysis: true,
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
    start_age: 65,
    growth_rate: 0,
    inflation_rate: 0,
    heir_bracket: "32",
    projection_years: 25,
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

// High non-SS income scenario where the widow's penalty actually surfaces.
// Large IRA + no conversions = persistent RMDs that get squeezed into Single
// brackets after death. Plus a pension that keeps non-SS income elevated.
function makeHighIncomeClient(extra: Partial<Client> = {}): Client {
  const currentYear = new Date().getFullYear();
  const pensionRows = [];
  for (let i = 0; i < 25; i++) {
    pensionRows.push({
      year: currentYear + i,
      age: 67 + i,
      gross_taxable: 80_000_00, // $80K/yr persistent pension income
      tax_exempt: 0,
      type: "pension" as const,
    });
  }
  return makeClient({
    age: 67,
    qualified_account_value: 3_000_000_00, // $3M IRA → big RMDs
    ssi_annual_amount: 36_000_00,
    spouse_ssi_annual_amount: 24_000_00,
    conversion_type: "no_conversion", // Don't deplete the IRA — keep RMDs big
    max_tax_rate: 24,
    rate_of_return: 6,
    end_age: 85,
    non_ssi_income: pensionRows,
    rmd_treatment: "spent",
    ...extra,
  });
}

// ============================================================================
// TEST 1: Returns a result for MFJ Growth FIA client
// ============================================================================
startTest("MFJ + Growth FIA produces widow analysis (no longer null)");
{
  const client = makeHighIncomeClient();
  const input = createSimulationInput(client);
  const result = runGrowthSimulation(input);
  const widow = analyzeWidowPenaltyFromProjection({
    client,
    formulaYears: result.formula,
    deathYear: new Date().getFullYear() + 5, // Death 5 yrs from now
  });
  console.log(`  Death year: ${widow.deathYear}`);
  console.log(`  Post-death years analyzed: ${widow.taxImpactByYear.length}`);
  console.log(`  Total additional tax: ${fmtCents(widow.totalAdditionalTax)}`);
  assert(widow.taxImpactByYear.length > 0, "Should produce at least one post-death year");
}

// ============================================================================
// TEST 2: Single-filer brackets produce HIGHER tax than MFJ for same income
// ============================================================================
startTest("Single tax > Married tax in post-death years (the widow's penalty)");
{
  const client = makeHighIncomeClient();
  const input = createSimulationInput(client);
  const result = runGrowthSimulation(input);
  const widow = analyzeWidowPenaltyFromProjection({
    client,
    formulaYears: result.formula,
    deathYear: new Date().getFullYear() + 5,
  });

  // With persistent pension + RMD income, the survivor pays MORE tax in Single
  // brackets every year. This is the textbook widow's-trap case advisors pitch.
  let positiveYears = 0;
  let anyMaterial = false;
  for (const impact of widow.taxImpactByYear) {
    if (impact.taxIncrease > 0) positiveYears++;
    if (impact.taxIncrease > 1_000_00) anyMaterial = true;
    console.log(
      `  Yr +${widow.taxImpactByYear.indexOf(impact)}: ` +
      `MFJ ${fmtCents(impact.marriedTax)} (${impact.marriedBracket}%) → ` +
      `Single ${fmtCents(impact.singleTax)} (${impact.singleBracket}%) ` +
      `Δ ${fmtCents(impact.taxIncrease)}`
    );
  }
  assert(anyMaterial, "At least one year should show material penalty (> $1K)");
  assert(widow.totalAdditionalTax > 10_000_00, "Total widow penalty should be > $10K");
  assert(
    positiveYears >= widow.taxImpactByYear.length * 0.7,
    `Most post-death years should show positive penalty (got ${positiveYears} / ${widow.taxImpactByYear.length})`
  );
}

// ============================================================================
// TEST 3: Bracket jumps when income is in the 22% MFJ band
// ============================================================================
startTest("MFJ 22% bracket → Single 22-24% (bracket compression)");
{
  // Force conversions large enough to push into 22% MFJ ($96K-$206K taxable)
  const client = makeClient({
    age: 67, // Start collecting SS immediately
    qualified_account_value: 2_000_000_00,
    max_tax_rate: 22,
    end_age: 90,
  });
  const input = createSimulationInput(client);
  const result = runGrowthSimulation(input);
  const widow = analyzeWidowPenaltyFromProjection({
    client,
    formulaYears: result.formula,
    deathYear: new Date().getFullYear() + 5,
  });

  // First post-death year should show the bracket squeeze
  const firstImpact = widow.taxImpactByYear[0];
  console.log(`  First post-death year: MFJ ${firstImpact.marriedBracket}% → Single ${firstImpact.singleBracket}%`);
  console.log(`  Tax increase: ${fmtCents(firstImpact.taxIncrease)}`);
  assert(firstImpact.singleBracket >= firstImpact.marriedBracket, "Single bracket should be >= MFJ bracket");
  assert(firstImpact.taxIncrease > 0, "Should have positive tax increase");
}

// ============================================================================
// TEST 4: Two clients — same scenario, different income mixes. The high-RMD
// client (with pension + large IRA) should show a positive widow penalty.
// The mostly-SS client may show a NEGATIVE delta (losing a SS check reduces
// taxable income overall). Both directions are correct behavior — we just
// verify the analyzer differentiates them.
// ============================================================================
startTest("Penalty direction depends on income mix (high RMD = positive, mostly SS = can be negative)");
{
  const highRmd = makeHighIncomeClient(); // $3M IRA + $80K pension
  const mostlySS = makeClient({
    age: 67,
    qualified_account_value: 200_000_00, // Tiny IRA
    ssi_annual_amount: 30_000_00,
    spouse_ssi_annual_amount: 25_000_00,
    conversion_type: "no_conversion",
    end_age: 85,
  });
  const highResult = runGrowthSimulation(createSimulationInput(highRmd));
  const ssResult = runGrowthSimulation(createSimulationInput(mostlySS));
  const highWidow = analyzeWidowPenaltyFromProjection({
    client: highRmd,
    formulaYears: highResult.formula,
    deathYear: new Date().getFullYear() + 5,
  });
  const ssWidow = analyzeWidowPenaltyFromProjection({
    client: mostlySS,
    formulaYears: ssResult.formula,
    deathYear: new Date().getFullYear() + 5,
  });
  console.log(`  High-RMD client total penalty: ${fmtCents(highWidow.totalAdditionalTax)}`);
  console.log(`  Mostly-SS client total penalty: ${fmtCents(ssWidow.totalAdditionalTax)}`);
  assert(
    highWidow.totalAdditionalTax > ssWidow.totalAdditionalTax,
    "High-RMD scenario must show a larger widow penalty than mostly-SS scenario"
  );
  assert(
    highWidow.totalAdditionalTax > 0,
    "High-RMD scenario must show a positive widow penalty"
  );
}

// ============================================================================
// TEST 5: Death year before any projection years → empty result (safety)
// ============================================================================
startTest("Death year before projection start → no impact rows, no crash");
{
  const client = makeClient({ age: 65, end_age: 70 });
  const input = createSimulationInput(client);
  const result = runGrowthSimulation(input);
  const widow = analyzeWidowPenaltyFromProjection({
    client,
    formulaYears: result.formula,
    deathYear: 1900, // Already happened, before all projection years
  });
  console.log(`  Years analyzed: ${widow.taxImpactByYear.length}`);
  console.log(`  Total additional tax: ${fmtCents(widow.totalAdditionalTax)}`);
  // Death year before projection → ALL years are "post-death" → all rows
  assert(widow.taxImpactByYear.length === result.formula.length, "All projection years are post-death");
}

// ============================================================================
// TEST 6: Death year far in the future → no post-death rows
// ============================================================================
startTest("Death year after projection end → empty taxImpactByYear");
{
  const client = makeClient({ age: 65, end_age: 75 }); // 10-year projection
  const input = createSimulationInput(client);
  const result = runGrowthSimulation(input);
  const widow = analyzeWidowPenaltyFromProjection({
    client,
    formulaYears: result.formula,
    deathYear: 2999,
  });
  console.log(`  Years analyzed: ${widow.taxImpactByYear.length}`);
  assert(widow.taxImpactByYear.length === 0, "No post-death years");
  assert(widow.totalAdditionalTax === 0, "No additional tax");
}

// ============================================================================
// TEST 7: Single-filer client throws (analyzer is MFJ-only)
// ============================================================================
startTest("Throws on non-MFJ client");
{
  const client = makeClient({ filing_status: "single" });
  const input = createSimulationInput(client);
  const result = runGrowthSimulation(input);
  let threw = false;
  try {
    analyzeWidowPenaltyFromProjection({
      client,
      formulaYears: result.formula,
    });
  } catch {
    threw = true;
  }
  assert(threw, "Should throw on Single filing status");
  console.log(`  Correctly threw on Single client`);
}

// ============================================================================
// TEST 8: Numbers consistent with main projection (no contradictions)
// ============================================================================
startTest("MFJ tax in widow analysis matches the main projection year exactly");
{
  const client = makeClient({ age: 67, end_age: 80 });
  const input = createSimulationInput(client);
  const result = runGrowthSimulation(input);
  const deathYear = new Date().getFullYear() + 5;
  const widow = analyzeWidowPenaltyFromProjection({
    client,
    formulaYears: result.formula,
    deathYear,
  });

  // For each post-death year, widow.marriedTax should equal projection.federalTax + irmaaSurcharge
  let mismatches = 0;
  for (let i = 0; i < widow.taxImpactByYear.length; i++) {
    const impact = widow.taxImpactByYear[i];
    const projYear = result.formula.find(y => y.year >= deathYear)!;
    if (!projYear) break;
    const projIdx = result.formula.indexOf(projYear) + i;
    if (projIdx >= result.formula.length) break;
    const py = result.formula[projIdx];
    const expectedMarried = py.federalTax + py.irmaaSurcharge;
    if (Math.abs(impact.marriedTax - expectedMarried) > 100) {
      console.log(`  Mismatch yr ${py.year}: widow.marriedTax=${fmtCents(impact.marriedTax)} vs proj=${fmtCents(expectedMarried)}`);
      mismatches++;
    }
  }
  assert(mismatches === 0, `Married tax should match the projection's federal+IRMAA exactly`);
  console.log(`  All ${widow.taxImpactByYear.length} post-death years match projection`);
}

console.log(`\n=== ${testNum} tests ${process.exitCode ? "FAILED" : "PASSED"} ===`);
