/**
 * Numbered tests for the respect_penalty_free_limit cap.
 *
 * Run with: npx tsx scripts/test-penalty-free-cap.ts
 *
 * Each test instantiates a synthetic Client, runs the Growth FIA strategy engine,
 * and asserts properties of the year-by-year output. All values in CENTS.
 *
 * REVISED MODEL (Joshua W., ticket 2b5ff7a4): the carrier penalty-free cap
 * restricts only the TAX dollars distributed out of the policy — it does NOT
 * cap the conversion amount itself, since a Roth conversion is an
 * intra-carrier Trad → Roth transfer that doesn't count against the
 * carrier's withdrawal allowance. The cap therefore only matters when
 * tax_payment_source = 'from_ira'; with 'from_taxable' the toggle is a
 * no-op (no money leaves the contract). When the cap binds, the conversion
 * still happens at the chosen size and the tax overflow is modeled as paid
 * from external funds (taxesPaidExternally on YearlyResult).
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
// TEST 2: Cap ON + from_taxable → no effect (cap only applies to tax-from-IRA)
// ============================================================================
startTest("Cap ON + from_taxable — toggle is a no-op (no money leaves contract)");
{
  const base = {
    conversion_type: "optimized_amount" as const,
    qualified_account_value: 1_000_000_00,
    penalty_free_percent: 10,
    max_tax_rate: 22,
    tax_payment_source: "from_taxable" as const,
  };
  const offResult = runGrowthSimulation(
    createSimulationInput(makeClient({ ...base, respect_penalty_free_limit: false }))
  );
  const onResult = runGrowthSimulation(
    createSimulationInput(makeClient({ ...base, respect_penalty_free_limit: true }))
  );
  const convOff = offResult.formula[0].conversionAmount ?? 0;
  const convOn = onResult.formula[0].conversionAmount ?? 0;
  const externalOn = onResult.formula[0].taxesPaidExternally ?? 0;
  console.log(`  Cap OFF year 1: ${fmtCents(convOff)}`);
  console.log(`  Cap ON  year 1: ${fmtCents(convOn)}, taxesPaidExternally: ${fmtCents(externalOn)}`);
  assert(convOff === convOn, `from_taxable: cap toggle must NOT change conversion (got ${fmtCents(convOff)} vs ${fmtCents(convOn)})`);
  assert(externalOn === 0, `from_taxable: taxesPaidExternally must stay 0 (carrier limit doesn't apply when tax isn't from IRA)`);
}

// ============================================================================
// TEST 3: Cap ON + from_ira + optimized → conversion preserved, tax-from-IRA capped
// ============================================================================
startTest("Cap ON + from_ira + optimized — taxFromIRA ≤ cap, conv unchanged from no-cap");
{
  const base = {
    conversion_type: "optimized_amount" as const,
    qualified_account_value: 1_000_000_00,
    penalty_free_percent: 10,
    max_tax_rate: 32, // higher bracket so tax exceeds 10% cap
    tax_payment_source: "from_ira" as const,
  };
  const offResult = runGrowthSimulation(
    createSimulationInput(makeClient({ ...base, respect_penalty_free_limit: false }))
  );
  const onResult = runGrowthSimulation(
    createSimulationInput(makeClient({ ...base, respect_penalty_free_limit: true }))
  );
  const convOff = offResult.formula[0].conversionAmount ?? 0;
  const convOn = onResult.formula[0].conversionAmount ?? 0;
  const taxFromIraOn = onResult.formula[0].taxesPaidFromIRA ?? 0;
  const externalOn = onResult.formula[0].taxesPaidExternally ?? 0;
  const cap = 1_000_000_00 * 0.10; // $100K
  console.log(`  Cap OFF year 1: conv ${fmtCents(convOff)}`);
  console.log(`  Cap ON  year 1: conv ${fmtCents(convOn)}, taxFromIRA ${fmtCents(taxFromIraOn)}, external ${fmtCents(externalOn)}`);
  assert(taxFromIraOn <= cap + 100, `taxFromIRA must respect cap (within $1 rounding); got ${fmtCents(taxFromIraOn)} vs cap ${fmtCents(cap)}`);
  // The conversion may differ slightly between cap on/off because the IRS sees
  // less distribution under the cap (smaller bracket fill); but it should NOT
  // collapse to the cap value as the old behavior did.
  assert(convOn > cap, `Conversion should EXCEED the cap — only the tax pulled from the IRA is restricted (got ${fmtCents(convOn)})`);
}

// ============================================================================
// TEST 4: Cap ON + from_ira + partial_amount — total target still respected
// ============================================================================
startTest("Cap ON + from_ira + partial_amount — cumulative target respected, tax-from-IRA capped");
{
  const client = makeClient({
    respect_penalty_free_limit: true,
    conversion_type: "partial_amount",
    target_partial_amount: 500_000_00, // $500K total target
    qualified_account_value: 1_000_000_00,
    penalty_free_percent: 10,
    max_tax_rate: 32,
    tax_payment_source: "from_ira",
  });
  const input = createSimulationInput(client);
  const result = runGrowthSimulation(input);

  let cumulative = 0;
  let maxTaxFromIra = 0;
  for (let i = 0; i < result.formula.length; i++) {
    const y = result.formula[i];
    cumulative += y.conversionAmount ?? 0;
    const boyIra = i === 0
      ? 1_000_000_00
      : (result.formula[i - 1].traditionalBalance ?? 0);
    const taxFromIra = y.taxesPaidFromIRA ?? 0;
    if (taxFromIra > maxTaxFromIra) maxTaxFromIra = taxFromIra;
    if (taxFromIra > 0) {
      const yearCap = Math.round(boyIra * 0.10);
      assert(taxFromIra <= yearCap + 100, `Year ${i + 1}: taxFromIRA ${fmtCents(taxFromIra)} must be ≤ cap ${fmtCents(yearCap)}`);
    }
  }
  console.log(`  Cumulative converted: ${fmtCents(cumulative)} (target: $500K)`);
  console.log(`  Max tax-from-IRA in any year: ${fmtCents(maxTaxFromIra)}`);
  assert(cumulative <= 500_000_00 + 100, `Cumulative ${fmtCents(cumulative)} should not exceed target+rounding`);
}

// ============================================================================
// TEST 5: Cap ON + from_ira → tax-from-IRA + external = total conversion tax
// ============================================================================
startTest("Cap ON + from_ira — taxFromIRA + taxExternal accounts for full conversion tax");
{
  const client = makeClient({
    respect_penalty_free_limit: true,
    conversion_type: "optimized_amount",
    qualified_account_value: 1_000_000_00,
    penalty_free_percent: 10,
    max_tax_rate: 32,
    tax_payment_source: "from_ira",
  });
  const input = createSimulationInput(client);
  const result = runGrowthSimulation(input);
  const year1 = result.formula[0];
  const taxFromIra = year1.taxesPaidFromIRA ?? 0;
  const external = year1.taxesPaidExternally ?? 0;
  const cap = 100_000_00;
  console.log(`  Year 1: taxFromIRA ${fmtCents(taxFromIra)} + external ${fmtCents(external)}`);
  assert(taxFromIra + external > 0, `Must have some conversion tax to test the split`);
  assert(taxFromIra <= cap + 100, `taxFromIRA must be ≤ cap`);
  // If cap binds, external > 0; if it doesn't, external = 0 — both are valid
  // depending on whether the optimizer hit the bracket or stayed below it.
  if (taxFromIra >= cap - 100) {
    assert(external > 0, `When tax-from-IRA hits the cap, external should absorb the overflow`);
  }
}

// ============================================================================
// TEST 6: Cap ON + from_ira + full_conversion → IRA emptied, external pays overflow
// ============================================================================
startTest("Cap ON + from_ira + full_conversion — IRA fully drained, tax overflow goes external");
{
  const client = makeClient({
    respect_penalty_free_limit: true,
    conversion_type: "full_conversion",
    qualified_account_value: 1_000_000_00,
    penalty_free_percent: 10,
    max_tax_rate: 32,
    tax_payment_source: "from_ira",
    end_age: 75,
  });
  const input = createSimulationInput(client);
  const result = runGrowthSimulation(input);
  const year1 = result.formula[0];
  const conv1 = year1.conversionAmount ?? 0;
  const taxFromIra = year1.taxesPaidFromIRA ?? 0;
  const external = year1.taxesPaidExternally ?? 0;
  const remainingIra = year1.traditionalBalance ?? 0;
  const cap = 100_000_00;
  console.log(`  Year 1: conv ${fmtCents(conv1)}, taxFromIRA ${fmtCents(taxFromIra)}, external ${fmtCents(external)}`);
  console.log(`  Remaining IRA after year 1: ${fmtCents(remainingIra)}`);
  // Per Joshua's clarification, full_conversion empties the IRA: conv + taxCap = iraAfterRmd.
  assert(conv1 > 800_000_00, `full_conversion should still empty most of the IRA in year 1 (got ${fmtCents(conv1)})`);
  assert(remainingIra < 10_000_00, `IRA should be (nearly) emptied (got ${fmtCents(remainingIra)})`);
  assert(taxFromIra <= cap + 100, `taxFromIRA must respect cap`);
  assert(external > 0, `Tax overflow should be paid externally`);
}

// ============================================================================
// TEST 7: Cap ON + from_ira + 0% allowance → all conversion tax is external
// ============================================================================
startTest("Cap ON + from_ira + penalty_free_percent = 0 — all conversion tax goes external");
{
  const client = makeClient({
    respect_penalty_free_limit: true,
    conversion_type: "optimized_amount",
    qualified_account_value: 1_000_000_00,
    penalty_free_percent: 0, // Carrier doesn't allow ANY internal tax distribution
    max_tax_rate: 32,
    tax_payment_source: "from_ira",
  });
  const input = createSimulationInput(client);
  const result = runGrowthSimulation(input);
  const year1 = result.formula[0];
  const conv1 = year1.conversionAmount ?? 0;
  const taxFromIra = year1.taxesPaidFromIRA ?? 0;
  const external = year1.taxesPaidExternally ?? 0;
  console.log(`  Year 1: conv ${fmtCents(conv1)}, taxFromIRA ${fmtCents(taxFromIra)}, external ${fmtCents(external)}`);
  assert(conv1 > 0, `Conversion should still happen even when no tax can come from IRA (got ${fmtCents(conv1)})`);
  assert(taxFromIra === 0, `taxFromIRA must be 0 with cap = 0 (got ${fmtCents(taxFromIra)})`);
  assert(external > 0, `All conversion tax must be external (got ${fmtCents(external)})`);
}

// ============================================================================
// TEST 8: Cap ON vs Cap OFF + from_ira → same conversion, different tax payment
// ============================================================================
startTest("Cap ON vs Cap OFF + from_ira — conversion preserved, tax payment differs");
{
  const base = {
    conversion_type: "optimized_amount" as const,
    qualified_account_value: 1_000_000_00,
    penalty_free_percent: 10,
    max_tax_rate: 32,
    tax_payment_source: "from_ira" as const,
  };
  const offResult = runGrowthSimulation(
    createSimulationInput(makeClient({ ...base, respect_penalty_free_limit: false }))
  );
  const onResult = runGrowthSimulation(
    createSimulationInput(makeClient({ ...base, respect_penalty_free_limit: true }))
  );
  const off1 = offResult.formula[0];
  const on1 = onResult.formula[0];
  const cap = 100_000_00;
  console.log(`  Cap OFF year 1: conv ${fmtCents(off1.conversionAmount ?? 0)}, taxFromIRA ${fmtCents(off1.taxesPaidFromIRA ?? 0)}, external ${fmtCents(off1.taxesPaidExternally ?? 0)}`);
  console.log(`  Cap ON  year 1: conv ${fmtCents(on1.conversionAmount ?? 0)}, taxFromIRA ${fmtCents(on1.taxesPaidFromIRA ?? 0)}, external ${fmtCents(on1.taxesPaidExternally ?? 0)}`);
  assert((off1.taxesPaidExternally ?? 0) === 0, `Cap OFF must keep taxesPaidExternally = 0`);
  assert((on1.taxesPaidFromIRA ?? 0) <= cap + 100, `Cap ON must keep taxFromIRA ≤ cap`);
  // Both runs are about the same scenario; conversion should be in the same ballpark
  // (within ~20% — they may differ because the IRS-visible distribution differs).
  const convOff = off1.conversionAmount ?? 0;
  const convOn = on1.conversionAmount ?? 0;
  if (convOff > 0) {
    const ratio = convOn / convOff;
    assert(ratio > 0.5 && ratio < 1.5, `Conversions should be in same ballpark (Cap OFF ${fmtCents(convOff)} vs Cap ON ${fmtCents(convOn)}, ratio ${ratio.toFixed(2)})`);
  }
}

// ============================================================================
// TEST 9: Cap releases after surrender period — post-contract no external overflow
// ============================================================================
startTest("Cap releases after surrender period — no external overflow once contract matures");
{
  const client = makeClient({
    respect_penalty_free_limit: true,
    conversion_type: "optimized_amount",
    qualified_account_value: 1_000_000_00,
    penalty_free_percent: 10,
    max_tax_rate: 32,
    surrender_years: 10,
    end_age: 80,
    tax_payment_source: "from_ira",
  });
  const input = createSimulationInput(client);
  const result = runGrowthSimulation(input);
  // Year 11 (yearOffset 10) is post-contract — cap should NOT apply
  const year11 = result.formula[10];
  const externalY11 = year11?.taxesPaidExternally ?? 0;
  console.log(`  Year 11 (post-contract): taxesPaidExternally ${fmtCents(externalY11)}`);
  assert(externalY11 === 0, `Post-surrender year should have no external tax overflow (cap is inactive); got ${fmtCents(externalY11)}`);
}

// ============================================================================
// TEST 10: all_distributions scope — TOTAL outflow (conv + tax) ≤ cap
// ============================================================================
// In the strict reading, conversion + tax-from-IRA must together fit under
// penalty_free_percent × BOY IRA. This is the Ben M. interpretation.
startTest("all_distributions scope — total outflow (conv + tax) ≤ cap, conv sized down");
{
  const client = makeClient({
    respect_penalty_free_limit: true,
    penalty_free_scope: "all_distributions",
    conversion_type: "optimized_amount",
    qualified_account_value: 1_000_000_00,
    penalty_free_percent: 10,
    max_tax_rate: 32,
    tax_payment_source: "from_ira",
  });
  const input = createSimulationInput(client);
  const result = runGrowthSimulation(input);
  const year1 = result.formula[0];
  const conv = year1.conversionAmount ?? 0;
  const taxFromIra = year1.taxesPaidFromIRA ?? 0;
  const external = year1.taxesPaidExternally ?? 0;
  const rmd = year1.rmdAmount ?? 0;
  const cap = 100_000_00; // 10% of $1M
  const total = conv + taxFromIra + rmd;
  console.log(`  Year 1: conv ${fmtCents(conv)}, taxFromIRA ${fmtCents(taxFromIra)}, external ${fmtCents(external)}, rmd ${fmtCents(rmd)}, TOTAL ${fmtCents(total)}, CAP ${fmtCents(cap)}`);
  assert(total <= cap + 100, `Total outflow MUST fit under cap in all_distributions scope (got ${fmtCents(total)} > ${fmtCents(cap)})`);
  assert(external === 0, `No external overflow in all_distributions scope (conversion was sized down instead); got ${fmtCents(external)}`);
  assert(conv > 0, `Conversion should still happen (just smaller); got ${fmtCents(conv)}`);
}

// ============================================================================
// TEST 11: tax_only vs all_distributions — same client, very different conv
// ============================================================================
startTest("tax_only vs all_distributions — different conv amounts under same toggle");
{
  const base = {
    respect_penalty_free_limit: true,
    conversion_type: "optimized_amount" as const,
    qualified_account_value: 1_000_000_00,
    penalty_free_percent: 10,
    max_tax_rate: 32,
    tax_payment_source: "from_ira" as const,
  };
  const taxOnly = runGrowthSimulation(
    createSimulationInput(makeClient({ ...base, penalty_free_scope: "tax_only" })),
  );
  const allDist = runGrowthSimulation(
    createSimulationInput(makeClient({ ...base, penalty_free_scope: "all_distributions" })),
  );
  const t = taxOnly.formula[0];
  const a = allDist.formula[0];
  console.log(`  tax_only         year 1: conv ${fmtCents(t.conversionAmount ?? 0)}, taxFromIRA ${fmtCents(t.taxesPaidFromIRA ?? 0)}`);
  console.log(`  all_distributions year 1: conv ${fmtCents(a.conversionAmount ?? 0)}, taxFromIRA ${fmtCents(a.taxesPaidFromIRA ?? 0)}`);
  const tConv = t.conversionAmount ?? 0;
  const aConv = a.conversionAmount ?? 0;
  assert(aConv < tConv, `all_distributions must size conv DOWN vs tax_only (tax_only ${fmtCents(tConv)}, all_distributions ${fmtCents(aConv)})`);
}

// ============================================================================
// TEST 12: all_distributions + fixed_amount — fixed amount honored if it fits
// ============================================================================
startTest("all_distributions + fixed_amount — fixed honored when conv + tax fits under cap");
{
  const client = makeClient({
    respect_penalty_free_limit: true,
    penalty_free_scope: "all_distributions",
    conversion_type: "fixed_amount",
    fixed_conversion_amount: 70_000_00, // $70K well under cap room
    qualified_account_value: 1_000_000_00,
    penalty_free_percent: 10,
    max_tax_rate: 22,
    tax_payment_source: "from_ira",
  });
  const result = runGrowthSimulation(createSimulationInput(client));
  const y1 = result.formula[0];
  const conv = y1.conversionAmount ?? 0;
  const taxFromIra = y1.taxesPaidFromIRA ?? 0;
  const total = conv + taxFromIra;
  console.log(`  Year 1: conv ${fmtCents(conv)}, taxFromIRA ${fmtCents(taxFromIra)}, TOTAL ${fmtCents(total)}`);
  // With $70K fixed + ~22% tax ≈ $20K → ~$90K, under $100K cap.
  assert(total <= 100_000_00 + 100, `Total outflow under cap (got ${fmtCents(total)})`);
  assert(conv > 60_000_00 && conv <= 70_000_00, `Conv should be near fixed amount (got ${fmtCents(conv)})`);
}

// ============================================================================
// TEST 13: all_distributions releases after surrender period
// ============================================================================
startTest("all_distributions — cap releases post-surrender, no longer binds conv");
{
  const client = makeClient({
    respect_penalty_free_limit: true,
    penalty_free_scope: "all_distributions",
    conversion_type: "optimized_amount",
    qualified_account_value: 1_000_000_00,
    penalty_free_percent: 10,
    max_tax_rate: 32,
    surrender_years: 10,
    end_age: 80,
    tax_payment_source: "from_ira",
  });
  const result = runGrowthSimulation(createSimulationInput(client));
  const y1 = result.formula[0];
  const y11 = result.formula[10]; // First post-surrender year
  const y1Conv = y1.conversionAmount ?? 0;
  const y11Conv = y11?.conversionAmount ?? 0;
  console.log(`  Year 1  (in surrender): conv ${fmtCents(y1Conv)}`);
  console.log(`  Year 11 (post-surrender): conv ${fmtCents(y11Conv)}`);
  // Post-surrender conversion should be NOT bound by the 10% cap
  // (it can be larger or zero depending on remaining IRA, but it shouldn't
  // be artificially limited to ~$100K).
  if (y11Conv > 0) {
    assert(
      y11Conv > y1Conv || y11Conv > 50_000_00,
      `Post-surrender conv should not be bound by 10% cap (y1 ${fmtCents(y1Conv)}, y11 ${fmtCents(y11Conv)})`,
    );
  }
}

console.log(`\n=== ${testNum} tests ${process.exitCode ? "FAILED" : "PASSED"} ===`);
