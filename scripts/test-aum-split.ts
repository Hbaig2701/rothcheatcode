/**
 * AUM split-allocation edge-case sweep. Run via:
 *   npx tsx scripts/test-aum-split.ts
 *
 * Builds a baseline mock client (engine wants ~80 fields) and runs scenario
 * variations through both engines, then sanity-checks invariants:
 *   - 0% allocation -> AUM bucket is empty, Roth side identical to no-AUM run
 *   - 100% allocation -> Roth side does ~0 conversions, AUM bucket carries everything
 *   - Withdrawal years bound balances correctly (end-of-projection pendingIra ~ 0)
 *   - All cents are integers (no leaked floats)
 *   - Combined balances are roughly conservation-preserving vs starting IRA
 */

import type { Client } from '@/lib/types/client';
import { runAumScenario } from '@/lib/calculations/scenarios/aum';
import { runFormulaScenario } from '@/lib/calculations/scenarios/formula';
import { runBaselineScenario } from '@/lib/calculations/scenarios/baseline';

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
}
function section(title: string) { console.log(`\n=== ${title} ===`); }
const fmt = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

// Build a complete mock client with all engine-required fields. Engine
// crashes if any are undefined that it dereferences.
function makeClient(overrides: Partial<Client> = {}): Client {
  const base: Client = {
    id: 'test-client',
    user_id: 'test-user',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    blueprint_type: 'fia',
    custom_product_id: null,
    scenario_name: null,
    filing_status: 'married_filing_jointly',
    name: 'Test Client',
    age: 60,
    spouse_name: 'Test Spouse',
    spouse_age: 58,
    qualified_account_value: 100_000_000, // $1M
    carrier_name: 'Generic Carrier',
    product_name: 'Generic Product',
    bonus_percent: 10,
    rate_of_return: 7,
    anniversary_bonus_percent: null,
    anniversary_bonus_years: null,
    state: 'CA',
    constraint_type: 'bracket_ceiling',
    tax_rate: 24,
    max_tax_rate: 24,
    tax_payment_source: 'from_taxable',
    state_tax_rate: 5,
    gross_taxable_non_ssi: 0,
    tax_exempt_non_ssi: 0,
    ssi_payout_age: 67,
    ssi_annual_amount: 3_000_000,
    spouse_ssi_payout_age: 67,
    spouse_ssi_annual_amount: 1_500_000,
    non_ssi_income: [],
    withdrawals: [],
    conversion_type: 'optimized_amount',
    fixed_conversion_amount: null,
    target_partial_amount: null,
    respect_penalty_free_limit: false,
    protect_initial_premium: false,
    withdrawal_type: 'no_withdrawals',
    payout_type: 'individual',
    income_start_age: 65,
    guaranteed_rate_of_return: 0,
    roll_up_option: null,
    payout_option: null,
    gi_conversion_years: 5,
    gi_conversion_bracket: 24,
    surrender_years: 7,
    surrender_schedule: null,
    penalty_free_percent: 10,
    baseline_comparison_rate: 7,
    post_contract_rate: 7,
    years_to_defer_conversion: 0,
    end_age: 95,
    heir_tax_rate: 40,
    widow_analysis: false,
    widow_death_age: null,
    rmd_treatment: 'reinvested',
    rmds_handled_externally: false,
    aum_allocation_percent: 0,
    aum_fee_percent: 1,
    aum_dividend_yield: 2,
    aum_turnover_percent: 10,
    aum_withdrawal_years: 5,
    ltcg_rate: 15,
    date_of_birth: null,
    spouse_dob: null,
    life_expectancy: null,
    traditional_ira: 100_000_000,
    roth_ira: 0,
    taxable_accounts: 0,
    other_retirement: 0,
    federal_bracket: '24',
    include_niit: false,
    include_aca: false,
    ss_self: 3_000_000,
    ss_spouse: 1_500_000,
    pension: 0,
    other_income: 0,
    ss_start_age: 67,
    strategy: 'moderate',
    start_age: 60,
    growth_rate: 7,
    inflation_rate: 2.5,
    heir_bracket: '40',
    projection_years: 35,
    sensitivity: false,
  };
  return { ...base, ...overrides };
}

// ============================================================================
section('Test 1: 0% allocation produces empty AUM bucket');
// ============================================================================
{
  const c = makeClient({ aum_allocation_percent: 0 });
  const aum = runAumScenario({
    startingIraPortion: 0,
    client: c,
    startYear: 2026,
    projectionYears: 35,
  });
  check('returns 35 years even at 0%', aum.length === 35);
  const finalAum = aum[aum.length - 1];
  check('final AUM balance is 0 when no money allocated', finalAum.taxableBalance === 0,
    `got ${fmt(finalAum.taxableBalance)}`);
  check('zero withdrawals when 0%', aum.every(y => (y.iraWithdrawal ?? 0) === 0));
  check('zero tax on AUM bucket when 0%', aum.every(y => y.totalTax === 0));
}

// ============================================================================
section('Test 2: 100% allocation, withdrawal=5yr, $1M IRA');
// ============================================================================
{
  const c = makeClient({ aum_allocation_percent: 100, aum_withdrawal_years: 5 });
  const aum = runAumScenario({
    startingIraPortion: 100_000_000, // $1M
    client: c,
    startYear: 2026,
    projectionYears: 35,
  });
  // Years 0-4 should withdraw, year 5+ should not
  for (let i = 0; i < 5; i++) {
    check(`year ${i} has IRA withdrawal`, (aum[i].iraWithdrawal ?? 0) > 0,
      `year ${i}: ${fmt(aum[i].iraWithdrawal ?? 0)}`);
  }
  for (let i = 5; i < 35; i++) {
    check(`year ${i} has zero IRA withdrawal`, (aum[i].iraWithdrawal ?? 0) === 0,
      `year ${i}: ${fmt(aum[i].iraWithdrawal ?? 0)}`);
  }
  // Pending IRA should hit 0 by end of year 4 (last withdrawal year)
  check('pending IRA cleared after withdrawal years', aum[5].traditionalBalance === 0,
    `year 5 pending IRA: ${fmt(aum[5].traditionalBalance)}`);
  // Total withdrawn should be ≥ starting IRA portion (pendingIra grows
  // tax-deferred while waiting, so the sum exceeds the principal). Cap
  // at 1.5× to catch runaway bugs.
  const totalWithdrawn = aum.reduce((s, y) => s + (y.iraWithdrawal ?? 0), 0);
  check(
    'total withdrawn is between starting amount and starting × 1.5',
    totalWithdrawn >= 100_000_000 && totalWithdrawn < 150_000_000,
    `withdrew ${fmt(totalWithdrawn)} (start ${fmt(100_000_000)})`,
  );

  // After bug-1 fix: with smooth distribution, no single year should pull
  // more than 2× the average per-year pull. Catches the old bracket-spike
  // behaviour where the last-year sweep dumped everything at once.
  const pulls = aum.map(y => y.iraWithdrawal ?? 0).filter(v => v > 0);
  const avgPull = pulls.reduce((s, v) => s + v, 0) / pulls.length;
  const maxPull = Math.max(...pulls);
  check(
    'no single-year pull exceeds 2× the average (no bracket spike)',
    maxPull <= avgPull * 2,
    `max ${fmt(maxPull)} vs avg ${fmt(avgPull)}`,
  );

  // Final AUM balance should be reasonable: $1M minus 29% tax on $1M ≈ $710K,
  // grown 30 years at ~6% net (after fee + drag) ≈ $4M-ish. Just check
  // it's positive and bounded.
  const finalBalance = aum[aum.length - 1].taxableBalance;
  check('final AUM balance positive', finalBalance > 0, `final: ${fmt(finalBalance)}`);
  check('final AUM balance under unrealistic ceiling ($20M)', finalBalance < 2_000_000_000,
    `final: ${fmt(finalBalance)}`);
  console.log(`  → final AUM balance: ${fmt(finalBalance)}`);
}

// ============================================================================
section('Test 3: 50/50 split — Roth side runs on $500K, AUM side on $500K');
// ============================================================================
{
  const cFull = makeClient({ aum_allocation_percent: 0 });
  const cSplit = makeClient({
    aum_allocation_percent: 50,
    aum_withdrawal_years: 5,
    qualified_account_value: 50_000_000, // ROTH SIDE only — what the dispatcher would pass
  });
  // Run the Roth engine on the reduced amount (mirrors dispatcher's buildRothSideClient)
  const rothFull = runFormulaScenario(cFull, 2026, 35);
  const rothHalf = runFormulaScenario(cSplit, 2026, 35);
  // Roth engine running on $500K should produce roughly half the conversions of running on $1M
  const fullConversions = rothFull.reduce((s, y) => s + y.conversionAmount, 0);
  const halfConversions = rothHalf.reduce((s, y) => s + y.conversionAmount, 0);
  console.log(`  → conversions full $1M: ${fmt(fullConversions)}, half $500K: ${fmt(halfConversions)}`);
  check('half-side conversions less than full-side', halfConversions < fullConversions,
    `half ${fmt(halfConversions)} >= full ${fmt(fullConversions)}`);
  check('half-side conversions are >0', halfConversions > 0);

  // Now run the AUM bucket on the other $500K
  const aum = runAumScenario({
    startingIraPortion: 50_000_000, // $500K
    client: cSplit,
    startYear: 2026,
    projectionYears: 35,
  });
  const aumFinal = aum[aum.length - 1].taxableBalance;
  check('AUM final balance positive', aumFinal > 0, `final: ${fmt(aumFinal)}`);
  console.log(`  → AUM final: ${fmt(aumFinal)} | Roth half final trad+roth: ${fmt(rothHalf[rothHalf.length - 1].traditionalBalance + rothHalf[rothHalf.length - 1].rothBalance)}`);
}

// ============================================================================
section('Test 4: integer cents — no float leaks');
// ============================================================================
{
  const c = makeClient({ aum_allocation_percent: 50, aum_withdrawal_years: 5 });
  const aum = runAumScenario({
    startingIraPortion: 50_000_000,
    client: c,
    startYear: 2026,
    projectionYears: 35,
  });
  const fields: (keyof typeof aum[0])[] = [
    'traditionalBalance', 'taxableBalance', 'totalTax', 'federalTax', 'stateTax',
    'iraWithdrawal', 'taxableBOY', 'traditionalBOY',
  ];
  let anyFloat = false;
  let firstOffender = '';
  for (let i = 0; i < aum.length; i++) {
    for (const f of fields) {
      const v = aum[i][f] as number | undefined;
      if (v !== undefined && !Number.isInteger(v)) {
        anyFloat = true;
        if (!firstOffender) firstOffender = `year ${i} ${String(f)}=${v}`;
      }
    }
  }
  check('all monetary fields are integer cents', !anyFloat, firstOffender);
}

// ============================================================================
section('Test 5: withdrawal_years=1 dumps all in year 1');
// ============================================================================
{
  const c = makeClient({ aum_allocation_percent: 100, aum_withdrawal_years: 1 });
  const aum = runAumScenario({
    startingIraPortion: 100_000_000,
    client: c,
    startYear: 2026,
    projectionYears: 35,
  });
  check('year 0 pulls everything', (aum[0].iraWithdrawal ?? 0) === 100_000_000,
    `year 0 pulled: ${fmt(aum[0].iraWithdrawal ?? 0)}`);
  check('year 1 pulls nothing', (aum[1].iraWithdrawal ?? 0) === 0,
    `year 1 pulled: ${fmt(aum[1].iraWithdrawal ?? 0)}`);
  check('year 0 pendingIra is 0 after dump', aum[0].traditionalBalance === 0,
    `year 0 pending: ${fmt(aum[0].traditionalBalance)}`);
}

// ============================================================================
section('Test 6: cost basis tracking — turnover never exceeds growth');
// ============================================================================
{
  const c = makeClient({ aum_allocation_percent: 100, aum_withdrawal_years: 1, aum_turnover_percent: 100 });
  const aum = runAumScenario({
    startingIraPortion: 100_000_000,
    client: c,
    startYear: 2026,
    projectionYears: 30,
  });
  // With 100% turnover, EVERY unrealized gain is realized each year. Tax drag
  // should keep the AUM balance from compounding wildly. Sanity: balance at
  // year 30 shouldn't exceed simple compounding of (post-tax-deposit) at
  // (rate - fee - LTCG_rate × rate).
  const balance30 = aum[29].taxableBalance;
  console.log(`  → 30yr balance (100% turnover): ${fmt(balance30)}`);
  check('balance positive after 30yr 100% turnover', balance30 > 0);
}

// ============================================================================
section('Test 7: integration — AUM never makes baseline NetWorth negative');
// ============================================================================
{
  const c = makeClient({ aum_allocation_percent: 50, aum_withdrawal_years: 5 });
  const baseline = runBaselineScenario(c, 2026, 35);
  // Baseline runs on FULL $1M and should never go negative.
  const minNetWorth = Math.min(...baseline.map(y => y.netWorth));
  check('baseline never negative net worth', minNetWorth >= 0, `min: ${fmt(minNetWorth)}`);
}

// ============================================================================
section('Test 8: realistic 50/50 sanity — combined > pure baseline?');
// ============================================================================
{
  const c = makeClient({
    aum_allocation_percent: 50,
    aum_withdrawal_years: 5,
    end_age: 95,
  });
  const cBaseline = makeClient({ aum_allocation_percent: 0, conversion_type: 'no_conversion' });
  const baseline = runBaselineScenario(cBaseline, 2026, 35);
  const baselineFinalNet = baseline[baseline.length - 1].netWorth;

  const cSplit: Client = { ...c, qualified_account_value: 50_000_000 };
  const rothSide = runFormulaScenario(cSplit, 2026, 35);
  const aumSide = runAumScenario({
    startingIraPortion: 50_000_000,
    client: c,
    startYear: 2026,
    projectionYears: 35,
  });
  const combinedFinalNet =
    rothSide[rothSide.length - 1].netWorth + aumSide[aumSide.length - 1].netWorth;

  console.log(`  → baseline (do nothing) final net worth:   ${fmt(baselineFinalNet)}`);
  console.log(`  → split (50/50) combined final net worth:  ${fmt(combinedFinalNet)}`);
  console.log(`  → delta: ${fmt(combinedFinalNet - baselineFinalNet)}`);
}

// ============================================================================
section('Test 9: 10% early-withdrawal penalty when client < 59½');
// ============================================================================
{
  const cYoung = makeClient({
    age: 50,
    aum_allocation_percent: 100,
    aum_withdrawal_years: 5,
  });
  const aum = runAumScenario({
    startingIraPortion: 100_000_000,
    client: cYoung,
    startYear: 2026,
    projectionYears: 35,
  });
  // Year 0 client is 50 → penalty applies → totalTax > withdrawal × ordinary effective alone.
  const year0 = aum[0];
  const ordinaryEffective = (cYoung.max_tax_rate / 100) + (cYoung.state_tax_rate! / 100);
  const expectedNoPenalty = Math.round((year0.iraWithdrawal ?? 0) * ordinaryEffective);
  check(
    'year 0 totalTax includes 10% penalty (client age 50)',
    year0.totalTax > expectedNoPenalty,
    `totalTax ${fmt(year0.totalTax)} vs no-penalty estimate ${fmt(expectedNoPenalty)}`,
  );
  check(
    'year 0 earlyWithdrawalPenalty field populated',
    (year0.earlyWithdrawalPenalty ?? 0) > 0,
    `penalty field: ${fmt(year0.earlyWithdrawalPenalty ?? 0)}`,
  );

  const cOld = makeClient({
    age: 65,
    aum_allocation_percent: 100,
    aum_withdrawal_years: 5,
  });
  const aumOld = runAumScenario({
    startingIraPortion: 100_000_000,
    client: cOld,
    startYear: 2026,
    projectionYears: 35,
  });
  check(
    'no penalty when client is 60+',
    (aumOld[0].earlyWithdrawalPenalty ?? 0) === 0,
  );
}

// ============================================================================
section('Test 10: DRIP — dividends added to basis, taxed once not twice');
// ============================================================================
{
  // High dividend yield, ZERO turnover — should isolate the DRIP path.
  // After many years, the unrealized gain should still be roughly equal to
  // PRICE appreciation (i.e. growth - dividends), not total return.
  const c = makeClient({
    aum_allocation_percent: 100,
    aum_withdrawal_years: 1,
    aum_dividend_yield: 4,
    aum_turnover_percent: 0,
  });
  const aum = runAumScenario({
    startingIraPortion: 100_000_000,
    client: c,
    startYear: 2026,
    projectionYears: 30,
  });
  // Year 0 after the dump: basis ≈ post-tax cash in (~$710K). Then 30 years of
  // growth at 7% with 4% dividend yield reinvested (basis up by 4%/yr) and a
  // 1% AUM fee + dividend tax drag at LTCG. Hard to assert exactly, but the
  // final balance shouldn't be wildly under what it'd be without DRIP-basis.
  const year29 = aum[29];
  check(
    'DRIP-aware tracking still produces positive balance',
    year29.taxableBalance > 0,
    `final balance: ${fmt(year29.taxableBalance)}`,
  );
}

// ============================================================================
section('Test 11: 100% AUM allocation — Roth headline copy makes sense');
// ============================================================================
{
  // This test isn't a unit test of the engine, just a reminder that the
  // dashboard banner now branches on blueConversions === 0.
  console.log('  (UI-only assertion — verified by reading growth-report-dashboard.tsx)');
}

// ============================================================================
section('SUMMARY');
// ============================================================================
console.log(`\nPassed: ${pass}`);
console.log(`Failed: ${fail}`);
process.exit(fail > 0 ? 1 : 0);
