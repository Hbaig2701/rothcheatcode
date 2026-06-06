/**
 * Edge-case tests for the new `widow_death_age` feature.
 *
 * The advisor-facing input lets them anchor the widow's analysis at a specific
 * "first death age." This script exercises the analyzer on clients with
 * unusual values: death age in the past, both spouses same age, single-spouse
 * data only, the boundary conditions (60/100), and the case where the older
 * spouse — not the primary — would die.
 *
 * Run: npx tsx scripts/test-widow-death-age-edge.ts
 */

import { runGrowthSimulation, createSimulationInput } from "../lib/calculations";
import { analyzeWidowPenaltyFromProjection } from "../lib/calculations/analysis/widow-penalty";
import type { Client } from "../lib/types/client";

let testNum = 0;
let failures = 0;

function startTest(name: string) {
  testNum++;
  console.log(`\n--- Test ${testNum}: ${name} ---`);
}
function note(msg: string) { console.log(`  · ${msg}`); }
function assert(cond: boolean, msg: string) {
  if (cond) { console.log(`  ✓ PASS: ${msg}`); return true; }
  console.error(`  ✗ FAIL: ${msg}`);
  failures++;
  process.exitCode = 1;
  return false;
}

function makeClient(overrides: Partial<Client>): Client {
  const base: Partial<Client> = {
    id: "edge-test",
    user_id: "u",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    blueprint_type: "fia",
    scenario_name: null,
    filing_status: "married_filing_jointly",
    name: "Edge",
    age: 65,
    spouse_name: "Spouse",
    spouse_age: 63,
    qualified_account_value: 1_000_000_00,
    carrier_name: "Test", product_name: "Test",
    bonus_percent: 0, rate_of_return: 5,
    state: "TX", constraint_type: "bracket_ceiling", tax_rate: 22, max_tax_rate: 22,
    tax_payment_source: "from_taxable", state_tax_rate: 0,
    gross_taxable_non_ssi: 0, tax_exempt_non_ssi: 0,
    ssi_payout_age: 67, ssi_annual_amount: 36_000_00,
    spouse_ssi_payout_age: 67, spouse_ssi_annual_amount: 18_000_00,
    non_ssi_income: [], conversion_type: "optimized_amount",
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
    years_to_defer_conversion: 0, end_age: 90, heir_tax_rate: 40,
    widow_analysis: true, widow_death_age: null,
    rmd_treatment: "reinvested",
    date_of_birth: null, spouse_dob: null, life_expectancy: null,
    traditional_ira: 0, roth_ira: 0, taxable_accounts: 0, other_retirement: 0,
    federal_bracket: "auto", include_niit: false, include_aca: false,
    ss_self: 0, ss_spouse: 0, pension: 0, other_income: 0, ss_start_age: 67,
    strategy: "moderate", start_age: 65, growth_rate: 0, inflation_rate: 0,
    heir_bracket: "32", projection_years: 25, sensitivity: false,
    anniversary_bonus_percent: null, anniversary_bonus_years: null,
    custom_product_id: null,
  };
  return { ...base, ...overrides } as Client;
}

const CY = new Date().getFullYear();

// ============================================================================
// TEST 1: widow_death_age in the PAST (death age < client current age)
// ============================================================================
startTest("widow_death_age in the past — analyzer treats all projection years as post-death");
{
  // Client age 70, death age 60 — death already happened. All projection years
  // should be re-priced as widow.
  const client = makeClient({ age: 70, spouse_age: 65, end_age: 95, widow_death_age: 60 });
  const r = runGrowthSimulation(createSimulationInput(client));
  const w = analyzeWidowPenaltyFromProjection({ client, formulaYears: r.formula });
  const yearsAnalyzed = w.taxImpactByYear.length;
  note(`Resolved death year: ${w.deathYear}`);
  note(`Years in projection: ${r.formula.length}`);
  note(`Years analyzed as post-death: ${yearsAnalyzed}`);
  assert(w.deathYear < CY, "Death year should be in the past, NOT clamped forward");
  assert(yearsAnalyzed === r.formula.length, "Every projection year should be treated as post-death");
}

// ============================================================================
// TEST 2: Death age == current client age (death "now")
// ============================================================================
startTest("widow_death_age equal to client's current age — death year = currentYear");
{
  const client = makeClient({ age: 67, spouse_age: 67, end_age: 90, widow_death_age: 67 });
  const r = runGrowthSimulation(createSimulationInput(client));
  const w = analyzeWidowPenaltyFromProjection({ client, formulaYears: r.formula });
  note(`Resolved death year: ${w.deathYear} (currentYear=${CY})`);
  assert(w.deathYear === CY, `Death year should equal currentYear (${CY})`);
  assert(w.taxImpactByYear.length === r.formula.length, "All years should be post-death");
}

// ============================================================================
// TEST 3: Older spouse identification — spouse YOUNGER than client
// ============================================================================
startTest("Spouse younger than client — older = client, anchor uses client's birth year");
{
  // Client age 75, spouse age 65 → client is older.
  const client = makeClient({ age: 75, spouse_age: 65, end_age: 100, widow_death_age: 85 });
  const r = runGrowthSimulation(createSimulationInput(client));
  const w = analyzeWidowPenaltyFromProjection({ client, formulaYears: r.formula });
  // Older spouse birth year = currentYear - 75. Death = (currentYear - 75) + 85 = currentYear + 10.
  const expected = (CY - 75) + 85;
  note(`Expected death year (CY+10): ${expected}`);
  note(`Resolved death year: ${w.deathYear}`);
  assert(w.deathYear === expected, "Anchor should use the OLDER spouse's birth year");
}

// ============================================================================
// TEST 4: Older spouse identification — client YOUNGER than spouse
// ============================================================================
startTest("Client younger than spouse — older = spouse, anchor uses spouse's birth year");
{
  const client = makeClient({ age: 60, spouse_age: 75, end_age: 100, widow_death_age: 85 });
  const r = runGrowthSimulation(createSimulationInput(client));
  const w = analyzeWidowPenaltyFromProjection({ client, formulaYears: r.formula });
  // Older = spouse, birth year = currentYear - 75. Death = (CY - 75) + 85 = CY + 10.
  const expected = (CY - 75) + 85;
  assert(w.deathYear === expected, "Anchor should use spouse's birth year when spouse is older");
}

// ============================================================================
// TEST 5: Both spouses same age — Math.min produces same year
// ============================================================================
startTest("Both spouses same age — anchor is unambiguous");
{
  const client = makeClient({ age: 70, spouse_age: 70, end_age: 95, widow_death_age: 80 });
  const r = runGrowthSimulation(createSimulationInput(client));
  const w = analyzeWidowPenaltyFromProjection({ client, formulaYears: r.formula });
  const expected = (CY - 70) + 80;
  assert(w.deathYear === expected, "Death year should resolve cleanly when both same age");
}

// ============================================================================
// TEST 6: Single-spouse data only (spouse_age null, no DOB)
// ============================================================================
startTest("Spouse data missing — falls back to client's birth year");
{
  // This shouldn't happen in practice (filing MFJ requires spouse) but the
  // analyzer shouldn't crash if it does.
  const client = makeClient({
    age: 67, spouse_age: null, spouse_dob: null,
    filing_status: "married_filing_jointly", // still MFJ for analyzer to run
    end_age: 95, widow_death_age: 80,
  });
  const r = runGrowthSimulation(createSimulationInput(client));
  const w = analyzeWidowPenaltyFromProjection({ client, formulaYears: r.formula });
  const expected = (CY - 67) + 80;
  note(`Resolved death year: ${w.deathYear}`);
  assert(w.deathYear === expected, "Should fall back to client's birth year when spouse age missing");
}

// ============================================================================
// TEST 7: DOB takes priority over age when both present
// ============================================================================
startTest("date_of_birth takes priority over age when both set");
{
  const client = makeClient({
    age: 67, // would imply birth year currentYear - 67
    date_of_birth: "1955-06-01", // explicit birth year 1955
    spouse_age: 65,
    end_age: 95,
    widow_death_age: 85,
  });
  const r = runGrowthSimulation(createSimulationInput(client));
  const w = analyzeWidowPenaltyFromProjection({ client, formulaYears: r.formula });
  // Older birth year: min(1955, CY-65). For CY=2026, CY-65 = 1961, so older = 1955.
  const olderBirthYear = Math.min(1955, CY - 65);
  const expected = olderBirthYear + 85;
  note(`Expected death year: ${expected}`);
  note(`Resolved: ${w.deathYear}`);
  assert(w.deathYear === expected, "DOB should anchor the older-spouse calc when set");
}

// ============================================================================
// TEST 8: widow_death_age = 100 with end_age = 90 → no post-death years
// ============================================================================
startTest("widow_death_age past projection end → empty taxImpactByYear, no crash");
{
  const client = makeClient({ age: 65, spouse_age: 63, end_age: 80, widow_death_age: 100 });
  const r = runGrowthSimulation(createSimulationInput(client));
  const w = analyzeWidowPenaltyFromProjection({ client, formulaYears: r.formula });
  note(`Death year: ${w.deathYear}, projection ends: ${r.formula[r.formula.length - 1]?.year}`);
  assert(w.taxImpactByYear.length === 0, "Should produce empty result, not crash");
  assert(w.totalAdditionalTax === 0, "Total additional tax should be 0");
}

// ============================================================================
// TEST 9: Boundary — widow_death_age = 60 (min)
// ============================================================================
startTest("widow_death_age = 60 — past dates pass through unchanged (no clamp)");
{
  const client = makeClient({ age: 67, spouse_age: 65, end_age: 95, widow_death_age: 60 });
  const r = runGrowthSimulation(createSimulationInput(client));
  const w = analyzeWidowPenaltyFromProjection({ client, formulaYears: r.formula });
  // Older birth = CY-67. Death = (CY-67)+60 = CY-7 (in the past — no clamp).
  const expected = (CY - 67) + 60;
  note(`Expected death year: ${expected}`);
  note(`Resolved death year: ${w.deathYear}`);
  assert(w.deathYear === expected, "Past death year should pass through unchanged");
}

// ============================================================================
// TEST 10: SS amount sanity — survivor takes the LARGER check
// ============================================================================
startTest("Survivor SS = max(primary, spouse) regardless of which dies");
{
  // Primary $24K, spouse $36K — survivor SS should be $36K (the larger).
  const client = makeClient({
    age: 67, spouse_age: 67, end_age: 85,
    ssi_annual_amount: 24_000_00,
    spouse_ssi_annual_amount: 36_000_00,
    widow_death_age: 70,
  });
  const r = runGrowthSimulation(createSimulationInput(client));
  const w = analyzeWidowPenaltyFromProjection({ client, formulaYears: r.formula });
  // The first post-death year should have survivor SS taxable amount based on
  // the larger of the two ($36K + COLA). We can't introspect that easily, but
  // we can check that the analysis runs and produces post-death rows.
  assert(w.taxImpactByYear.length > 0, "Should produce post-death rows");
  note(`Years analyzed: ${w.taxImpactByYear.length}`);
}

// ============================================================================
// TEST 11: Malformed DOB doesn't produce NaN death year
// ============================================================================
startTest("Malformed DOB → defensive guard, falls through to age");
{
  const client = makeClient({
    age: 67,
    spouse_age: 65,
    date_of_birth: "not-a-date",   // would parse as NaN year
    spouse_dob: "",                 // empty string
    end_age: 95,
    widow_death_age: 80,
  });
  const r = runGrowthSimulation(createSimulationInput(client));
  const w = analyzeWidowPenaltyFromProjection({ client, formulaYears: r.formula });
  note(`Resolved death year: ${w.deathYear}`);
  // Should fall through to age-based calc: older = CY-67, death = (CY-67)+80.
  const expected = (CY - 67) + 80;
  assert(Number.isFinite(w.deathYear), "Death year must be a finite number, not NaN");
  assert(w.deathYear === expected, `Death year should fall through to age (got ${w.deathYear}, want ${expected})`);
}

// ============================================================================
// TEST 12: widow_death_age honored when no birth year info available
// ============================================================================
startTest("widow_death_age honored even without birth year — uses currentYear as anchor");
{
  // The engine requires a valid age to even produce a projection, so we drive
  // the analyzer directly with a synthetic projection. The interesting case is
  // a Client whose age + DOB + spouse_age + spouse_dob are ALL missing while
  // widow_death_age is set — the analyzer should still respect the advisor's
  // override rather than silently dropping it.
  const client = makeClient({
    age: 0 as unknown as number, // 0 reads as falsy/non-positive in the guard
    spouse_age: null,
    date_of_birth: null,
    spouse_dob: null,
    end_age: 95,
    widow_death_age: 10,
  });
  const fakeProjection = Array.from({ length: 12 }, (_, i) => ({
    year: CY + i,
    age: 67 + i,
    spouseAge: 65 + i,
    traditionalBalance: 0, rothBalance: 0, taxableBalance: 0,
    rmdAmount: 0, conversionAmount: 0, ssIncome: 0,
    pensionIncome: 0, otherIncome: 0, totalIncome: 0,
    federalTax: 0, stateTax: 0, niitTax: 0, irmaaSurcharge: 0, totalTax: 0,
    taxableSS: 0, netWorth: 0,
  })) as never;
  const w = analyzeWidowPenaltyFromProjection({ client, formulaYears: fakeProjection });
  note(`Resolved death year: ${w.deathYear}`);
  assert(w.deathYear === CY + 10, `Override should be respected as years-from-now (got ${w.deathYear}, want ${CY + 10})`);
}

console.log(`\n=== ${testNum} tests ${failures > 0 ? `FAILED (${failures})` : "PASSED"} ===`);
