/**
 * Custom Product correctness tests.
 *
 * Custom products are a UI convenience: when selected, they pre-fill the client
 * form with their config values (bonus_percent, surrender_schedule, rate_of_return,
 * etc.) and set client.blueprint_type = product.engine_preset. From there the
 * engine runs identically to the system preset path.
 *
 * What we want to verify:
 *   1. A custom product matching a system preset 1:1 produces identical engine output.
 *   2. Diverging from the system preset (different bonus, surrender, etc.) produces
 *      output that differs in the expected direction.
 *   3. Fields the engine ignores (custom rider fee on growth, custom roll-up rate /
 *      payout factor / rider fee on GI) DO NOT affect output — confirming those
 *      slots in the custom config are dead weight today.
 *
 * Run with: npx tsx scripts/test-custom-products.ts
 */

import {
  runGrowthSimulation,
  runGuaranteedIncomeSimulation,
  createSimulationInput,
} from "../lib/calculations";
import type { Client } from "../lib/types/client";
import type {
  CustomProductRow,
  ProductConfigPayload,
  ProductArchetype,
} from "../lib/products/types";
import { ARCHETYPE_TO_ENGINE_PRESET } from "../lib/products/types";
import type { FormulaType } from "../lib/config/products";

// ============================================================================
// Helpers
// ============================================================================

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
    qualified_account_value: 1_000_000_00, // $1M
    carrier_name: "Test Carrier",
    product_name: "Test Product",
    bonus_percent: 0,
    rate_of_return: 7,
    anniversary_bonus_percent: null,
    anniversary_bonus_years: null,
    state: "TX",
    constraint_type: "none",
    tax_rate: 22,
    max_tax_rate: 24,
    tax_payment_source: "from_taxable",
    state_tax_rate: 0,
    gross_taxable_non_ssi: 0,
    tax_exempt_non_ssi: 0,
    ssi_payout_age: 67,
    ssi_annual_amount: 36_000_00,
    spouse_ssi_payout_age: 67,
    spouse_ssi_annual_amount: 18_000_00,
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
    baseline_comparison_rate: 7,
    post_contract_rate: 7,
    years_to_defer_conversion: 0,
    end_age: 90,
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
    start_age: 65,
    growth_rate: 0,
    inflation_rate: 0,
    heir_bracket: "32",
    projection_years: 25,
    sensitivity: false,
  };
  return { ...base, ...overrides } as Client;
}

/**
 * Mirror the form's `applyCustomProduct(product)` behavior in
 * components/clients/sections/new-account.tsx — overlay product config onto
 * the client, then return the resulting client. This is the input the engine
 * actually sees.
 */
function applyCustomProductToClient(
  baseClient: Client,
  product: Partial<CustomProductRow> & { config: ProductConfigPayload; engine_preset: FormulaType }
): Client {
  const cfg = product.config;
  return {
    ...baseClient,
    custom_product_id: product.id ?? null,
    blueprint_type: product.engine_preset as Client["blueprint_type"],
    bonus_percent: cfg.bonus.percentage,
    surrender_years: cfg.surrender.years,
    penalty_free_percent: cfg.withdrawals.penalty_free_percent,
    rate_of_return: cfg.form_defaults?.rate_of_return ?? 7,
    anniversary_bonus_percent: cfg.bonus.anniversary_rate ?? null,
    anniversary_bonus_years: cfg.bonus.anniversary_years ?? null,
    surrender_schedule: cfg.surrender.schedule.length ? cfg.surrender.schedule : null,
  };
}

/**
 * Build a complete CustomProductRow from a config payload. Tests use this to
 * create the row that flows through to the engine via SimulationInput.
 */
function makeCustomProduct(
  archetype: ProductArchetype,
  config: ProductConfigPayload,
  overrides: Partial<CustomProductRow> = {}
): CustomProductRow {
  const isGrowth = archetype.startsWith("growth-");
  return {
    id: overrides.id ?? "test-" + Math.random().toString(36).slice(2, 10),
    user_id: "test-user",
    name: overrides.name ?? `Test ${archetype}`,
    carrier_name: null,
    carrier_product_name: null,
    category: isGrowth ? "growth" : "income",
    archetype,
    engine_preset: ARCHETYPE_TO_ENGINE_PRESET[archetype],
    modifier_flags: [],
    config,
    source: "manual",
    ai_research_sources: null,
    ai_warnings: null,
    ai_unsupported_features: null,
    is_favorite: false,
    is_archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function fmtCents(c: number): string {
  return `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

let testNum = 0;
let failures = 0;

function startTest(name: string) {
  testNum++;
  console.log(`\n--- Test ${testNum}: ${name} ---`);
}

function assert(cond: boolean, message: string) {
  if (!cond) {
    console.error(`  ✗ FAIL: ${message}`);
    failures++;
    process.exitCode = 1;
    return false;
  }
  console.log(`  ✓ PASS: ${message}`);
  return true;
}

function note(msg: string) {
  console.log(`  · ${msg}`);
}

// Run a Growth scenario and pull final-year IRA + Roth + total
function runGrowth(client: Client, customProduct?: CustomProductRow | null) {
  const input = createSimulationInput(client, customProduct);
  const result = runGrowthSimulation(input);
  const last = result.formula[result.formula.length - 1];
  return {
    formulaYears: result.formula,
    last,
    finalIRA: last.traditionalBalance,
    finalRoth: last.rothBalance,
    finalTaxable: last.taxableBalance,
    finalTotal: last.traditionalBalance + last.rothBalance + last.taxableBalance,
  };
}

function runGI(client: Client, customProduct?: CustomProductRow | null) {
  const input = createSimulationInput(client, customProduct);
  const result = runGuaranteedIncomeSimulation(input);
  const last = result.formula[result.formula.length - 1];
  // For GI products, use the year where income base is locked in (max across run)
  const peakIncomeBase = Math.max(
    ...result.formula.map((y) => y.incomeRiderValue ?? 0)
  );
  const peakAccountValue = Math.max(
    ...result.formula.map((y) => y.accumulationValue ?? 0)
  );
  return {
    formulaYears: result.formula,
    last,
    finalIRA: last.traditionalBalance,
    finalRoth: last.rothBalance,
    finalTaxable: last.taxableBalance,
    finalTotal: last.traditionalBalance + last.rothBalance + last.taxableBalance,
    accountValue: peakAccountValue,
    incomeBase: peakIncomeBase,
    giMetrics: result.giMetrics,
  };
}

// ============================================================================
// TEST 1: Identity — Custom Vesting Bonus Growth matches system preset
// ============================================================================
startTest("Custom growth-vesting product, params identical to system preset");
{
  // System "Vesting Bonus Growth" defaults: bonus=14, surrender 10 yrs,
  // schedule [12.5,12.5,11.3,10,8.8,7.5,6.3,5,3.8,2.5] (from prod DB Test Product),
  // penalty-free 10%, rate 7%, no anniversary bonus.
  const sharedSchedule = [12.5, 12.5, 11.3, 10, 8.8, 7.5, 6.3, 5, 3.8, 2.5];

  // System path
  const systemClient = makeClient({
    blueprint_type: "vesting-bonus-growth",
    bonus_percent: 14,
    surrender_years: 10,
    surrender_schedule: sharedSchedule,
    penalty_free_percent: 10,
    rate_of_return: 7,
  });

  // Custom path — overlay equivalent product
  const baseClient = makeClient({});
  const customProduct = {
    engine_preset: "vesting-bonus-growth" as FormulaType,
    config: {
      bonus: {
        percentage: 14,
        type: "vesting" as const,
        vesting_years: 10,
        vesting_schedule: "linear" as const,
      },
      surrender: { years: 10, schedule: sharedSchedule },
      fees: { annual_rider_fee: 0, fee_duration: "surrender_period" as const },
      withdrawals: {
        penalty_free_percent: 10,
        year_1_rule: "same" as const,
        cumulative_withdrawal: false,
      },
      other: { mva_applies: false },
      form_defaults: { rate_of_return: 7 },
    } satisfies ProductConfigPayload,
  };
  const customClient = applyCustomProductToClient(baseClient, customProduct);

  const sys = runGrowth(systemClient);
  const cus = runGrowth(customClient);

  note(`System  final IRA=${fmtCents(sys.finalIRA)} Roth=${fmtCents(sys.finalRoth)} total=${fmtCents(sys.finalTotal)}`);
  note(`Custom  final IRA=${fmtCents(cus.finalIRA)} Roth=${fmtCents(cus.finalRoth)} total=${fmtCents(cus.finalTotal)}`);

  assert(sys.finalIRA === cus.finalIRA, "Final IRA balance should match exactly");
  assert(sys.finalRoth === cus.finalRoth, "Final Roth balance should match exactly");
  assert(sys.finalTotal === cus.finalTotal, "Final total wealth should match exactly");
}

// ============================================================================
// TEST 2: Bonus delta — Custom 18% vs system 14% should grow more
// ============================================================================
startTest("Custom growth product with higher bonus produces higher Roth + IRA");
{
  const baseClient = makeClient({});
  const sharedSchedule = [12.5, 12.5, 11.3, 10, 8.8, 7.5, 6.3, 5, 3.8, 2.5];

  const lowBonus = applyCustomProductToClient(baseClient, {
    engine_preset: "vesting-bonus-growth" as FormulaType,
    config: {
      bonus: { percentage: 14, type: "vesting" },
      surrender: { years: 10, schedule: sharedSchedule },
      fees: { annual_rider_fee: 0, fee_duration: "surrender_period" },
      withdrawals: { penalty_free_percent: 10, year_1_rule: "same", cumulative_withdrawal: false },
      other: { mva_applies: false },
      form_defaults: { rate_of_return: 7 },
    },
  });
  const highBonus = applyCustomProductToClient(baseClient, {
    engine_preset: "vesting-bonus-growth" as FormulaType,
    config: {
      bonus: { percentage: 18, type: "vesting" },
      surrender: { years: 10, schedule: sharedSchedule },
      fees: { annual_rider_fee: 0, fee_duration: "surrender_period" },
      withdrawals: { penalty_free_percent: 10, year_1_rule: "same", cumulative_withdrawal: false },
      other: { mva_applies: false },
      form_defaults: { rate_of_return: 7 },
    },
  });

  const lo = runGrowth(lowBonus);
  const hi = runGrowth(highBonus);
  note(`14% bonus  final total=${fmtCents(lo.finalTotal)}`);
  note(`18% bonus  final total=${fmtCents(hi.finalTotal)}`);
  // Initial premium difference = 4% × $1M = $40k. Compounded ~25y at 7% it's
  // way more than $40k by year 25 — but we just want directional check.
  assert(hi.finalTotal > lo.finalTotal, "Higher bonus must end with more wealth");
  const diff = hi.finalTotal - lo.finalTotal;
  note(`Difference = ${fmtCents(diff)} (≥ $40k expected from initial bonus alone)`);
  assert(diff >= 4_000_000, "Difference should be at least $40k (initial bonus delta)");
}

// ============================================================================
// TEST 3: Custom growth rider fee NOW flows through (bug fix)
// ============================================================================
startTest("Custom growth rider fee is APPLIED via customProduct passthrough");
{
  const baseClient = makeClient({});
  const sched = [12, 12, 12, 11, 10, 9, 8, 7, 6, 4];

  const noFeeConfig: ProductConfigPayload = {
    bonus: { percentage: 14, type: "vesting" },
    surrender: { years: 10, schedule: sched },
    fees: { annual_rider_fee: 0, fee_duration: "surrender_period" },
    withdrawals: { penalty_free_percent: 10, year_1_rule: "same", cumulative_withdrawal: false },
    other: { mva_applies: false },
    form_defaults: { rate_of_return: 7 },
  };
  const heavyFeeConfig: ProductConfigPayload = {
    ...noFeeConfig,
    fees: { annual_rider_fee: 2.0, fee_duration: "surrender_period" },
  };

  const noFeeProduct = makeCustomProduct("growth-vesting", noFeeConfig);
  const heavyFeeProduct = makeCustomProduct("growth-vesting", heavyFeeConfig);

  const noFeeClient = applyCustomProductToClient(baseClient, noFeeProduct);
  const heavyFeeClient = applyCustomProductToClient(baseClient, heavyFeeProduct);

  const a = runGrowth(noFeeClient, noFeeProduct);
  const b = runGrowth(heavyFeeClient, heavyFeeProduct);
  note(`0% rider via customProduct: total=${fmtCents(a.finalTotal)}`);
  note(`2% rider via customProduct: total=${fmtCents(b.finalTotal)}`);
  // 2% rider over the 10-year surrender period on a $1M-ish balance
  // should drag total down by tens of thousands.
  assert(
    b.finalTotal < a.finalTotal,
    "Higher custom rider fee must reduce final wealth"
  );
  const drag = a.finalTotal - b.finalTotal;
  note(`Rider fee drag = ${fmtCents(drag)}`);
  assert(drag >= 1_000_000, "Rider drag should be at least $10k over the surrender period");
}

// ============================================================================
// TEST 4: Custom anniversary bonus on phased-bonus-growth engine
// ============================================================================
startTest("Custom phased product — custom anniversary values override system 4%/3yr");
{
  const baseClient = makeClient({});
  // System phased-bonus-growth defaults: bonus=10, anniversary=4%/3yr,
  // schedule [16,14.5,13,11.5,9.5,8,6.5,5,3,1].
  const sched = [16, 14.5, 13, 11.5, 9.5, 8, 6.5, 5, 3, 1];

  const sysLike = applyCustomProductToClient(baseClient, {
    engine_preset: "phased-bonus-growth" as FormulaType,
    config: {
      bonus: { percentage: 10, type: "phased", anniversary_rate: 4, anniversary_years: 3 },
      surrender: { years: 10, schedule: sched },
      fees: { annual_rider_fee: 0, fee_duration: "surrender_period" },
      withdrawals: { penalty_free_percent: 10, year_1_rule: "same", cumulative_withdrawal: false },
      other: { mva_applies: false },
      form_defaults: { rate_of_return: 7 },
    },
  });
  const richer = applyCustomProductToClient(baseClient, {
    engine_preset: "phased-bonus-growth" as FormulaType,
    config: {
      bonus: { percentage: 10, type: "phased", anniversary_rate: 6, anniversary_years: 5 },
      surrender: { years: 10, schedule: sched },
      fees: { annual_rider_fee: 0, fee_duration: "surrender_period" },
      withdrawals: { penalty_free_percent: 10, year_1_rule: "same", cumulative_withdrawal: false },
      other: { mva_applies: false },
      form_defaults: { rate_of_return: 7 },
    },
  });

  const a = runGrowth(sysLike);
  const b = runGrowth(richer);
  note(`Anniversary 4%/3yr:  total=${fmtCents(a.finalTotal)}`);
  note(`Anniversary 6%/5yr:  total=${fmtCents(b.finalTotal)}`);
  assert(b.finalTotal > a.finalTotal, "Richer anniversary bonus must produce more wealth");
}

// ============================================================================
// TEST 5: Custom GI roll-up rate NOW flows through (bug fix)
// ============================================================================
startTest("Custom GI product roll-up rate is APPLIED via customProduct passthrough");
{
  // Set income_start_age = 70 so we get 5 years of true deferral roll-up
  // (purchase at 65 → defer 5 years → start income at 70). With income_start_age=65
  // the deferral is 0 and only the year-1 purchase-phase roll-up applies — too small
  // a window to distinguish 4% from 12% by more than ~8%.
  const baseClient = makeClient({
    age: 60,
    income_start_age: 70,
    rate_of_return: 5,
    gi_conversion_years: 5,
  });
  const sched = [9, 8, 7, 6.5, 5.5, 4.5, 3.5, 2.5, 1.5, 0.5];

  const lowRollupConfig: ProductConfigPayload = {
    bonus: { percentage: 20, type: "immediate", applies_to: "income_base" },
    surrender: { years: 10, schedule: sched },
    fees: { annual_rider_fee: 1.25, fee_duration: "lifetime" },
    withdrawals: { penalty_free_percent: 10, year_1_rule: "same", cumulative_withdrawal: false },
    other: { mva_applies: false },
    form_defaults: { rate_of_return: 5 },
    income: {
      roll_up_type: "compound",
      roll_up_rate: 4,
      roll_up_split_rate: false,
      roll_up_max_years: 10,
      payout_factors: { single: {}, joint: {} },
    },
  };
  const highRollupConfig: ProductConfigPayload = {
    ...lowRollupConfig,
    income: {
      ...lowRollupConfig.income!,
      roll_up_rate: 12,
    },
  };

  const lowRollup = makeCustomProduct("income-compound-flat", lowRollupConfig);
  const highRollup = makeCustomProduct("income-compound-flat", highRollupConfig);

  const lowClient = applyCustomProductToClient(baseClient, lowRollup);
  const highClient = applyCustomProductToClient(baseClient, highRollup);

  const lo = runGI(lowClient, lowRollup);
  const hi = runGI(highClient, highRollup);
  note(`Custom 4% roll-up:  income base peak=${fmtCents(lo.incomeBase)}`);
  note(`Custom 12% roll-up: income base peak=${fmtCents(hi.incomeBase)}`);
  assert(
    hi.incomeBase > lo.incomeBase,
    "Higher custom roll-up rate must produce a higher income base"
  );
  const ratio = hi.incomeBase / lo.incomeBase;
  note(`Ratio = ${ratio.toFixed(2)}x`);
  // 12% compound × 5 deferral years vs 4% compound × 5 years — ratio of
  // (1.12^5)/(1.04^5) = 1.762/1.217 ≈ 1.45×. The income base also includes
  // the bonus + initial principal so the actual ratio will be smaller than
  // 1.45 but should still exceed 1.10×.
  assert(ratio > 1.1, "Roll-up rate ratio should produce at least 1.1× income-base ratio");
}

// ============================================================================
// TEST 6: Custom GI bonus_percent IS applied (form value, not GI table)
// ============================================================================
startTest("Custom GI product bonus_percent is honored by engine (form value)");
{
  const baseClient = makeClient({
    age: 60,
    income_start_age: 65,
    rate_of_return: 5,
    gi_conversion_years: 5,
  });
  const sched = [9, 8, 7, 6.5, 5.5, 4.5, 3.5, 2.5, 1.5, 0.5];

  const lowBonus = applyCustomProductToClient(baseClient, {
    engine_preset: "compound-rollup-income" as FormulaType,
    config: {
      bonus: { percentage: 5, type: "immediate", applies_to: "income_base" },
      surrender: { years: 10, schedule: sched },
      fees: { annual_rider_fee: 1.25, fee_duration: "lifetime" },
      withdrawals: { penalty_free_percent: 10, year_1_rule: "same", cumulative_withdrawal: false },
      other: { mva_applies: false },
      form_defaults: { rate_of_return: 5 },
    },
  });
  const highBonus = applyCustomProductToClient(baseClient, {
    engine_preset: "compound-rollup-income" as FormulaType,
    config: {
      bonus: { percentage: 30, type: "immediate", applies_to: "income_base" },
      surrender: { years: 10, schedule: sched },
      fees: { annual_rider_fee: 1.25, fee_duration: "lifetime" },
      withdrawals: { penalty_free_percent: 10, year_1_rule: "same", cumulative_withdrawal: false },
      other: { mva_applies: false },
      form_defaults: { rate_of_return: 5 },
    },
  });

  const lo = runGI(lowBonus);
  const hi = runGI(highBonus);
  note(`5% bonus:  income base end=${fmtCents(lo.incomeBase)}`);
  note(`30% bonus: income base end=${fmtCents(hi.incomeBase)}`);
  assert(hi.incomeBase > lo.incomeBase, "Larger bonus_percent must produce larger income base");
}

// ============================================================================
// TEST 7: Identity — Simple Roll-up custom matches system
// ============================================================================
startTest("Custom Simple Roll-up Income (income-simple-both) matches system preset");
{
  const sysClient = makeClient({
    blueprint_type: "simple-rollup-income",
    bonus_percent: 14,
    surrender_years: 10,
    surrender_schedule: [9, 8, 7, 6.5, 5.5, 4.5, 3.5, 2.5, 1.5, 0.5],
    penalty_free_percent: 10,
    rate_of_return: 5,
    age: 60,
    income_start_age: 65,
    gi_conversion_years: 5,
  });
  const baseClient = makeClient({
    age: 60,
    income_start_age: 65,
    rate_of_return: 5,
    gi_conversion_years: 5,
  });
  const customClient = applyCustomProductToClient(baseClient, {
    engine_preset: "simple-rollup-income" as FormulaType,
    config: {
      bonus: { percentage: 14, type: "immediate", applies_to: "both" },
      surrender: { years: 10, schedule: [9, 8, 7, 6.5, 5.5, 4.5, 3.5, 2.5, 1.5, 0.5] },
      fees: { annual_rider_fee: 1.20, fee_duration: "lifetime" },
      withdrawals: { penalty_free_percent: 10, year_1_rule: "same", cumulative_withdrawal: false },
      other: { mva_applies: false },
      form_defaults: { rate_of_return: 5 },
    },
  });

  const a = runGI(sysClient);
  const b = runGI(customClient);
  note(`System  income base=${fmtCents(a.incomeBase)} total=${fmtCents(a.finalTotal)}`);
  note(`Custom  income base=${fmtCents(b.incomeBase)} total=${fmtCents(b.finalTotal)}`);
  assert(a.incomeBase === b.incomeBase, "Income base should match exactly");
  assert(a.finalTotal === b.finalTotal, "Final total should match exactly");
}

// ============================================================================
// TEST 8: Custom GI rider fee flows through (bug fix)
// ============================================================================
startTest("Custom GI rider fee is APPLIED via customProduct passthrough");
{
  const baseClient = makeClient({
    age: 60,
    income_start_age: 65,
    rate_of_return: 5,
    gi_conversion_years: 5,
  });
  const sched = [9, 8, 7, 6.5, 5.5, 4.5, 3.5, 2.5, 1.5, 0.5];

  const lightFeeConfig: ProductConfigPayload = {
    bonus: { percentage: 14, type: "immediate", applies_to: "both" },
    surrender: { years: 10, schedule: sched },
    fees: { annual_rider_fee: 0.5, fee_duration: "lifetime" },
    withdrawals: { penalty_free_percent: 10, year_1_rule: "same", cumulative_withdrawal: false },
    other: { mva_applies: false },
    form_defaults: { rate_of_return: 5 },
  };
  const heavyFeeConfig: ProductConfigPayload = {
    ...lightFeeConfig,
    fees: { annual_rider_fee: 3.0, fee_duration: "lifetime" }, // crushing fee
  };

  const lightP = makeCustomProduct("income-simple-both", lightFeeConfig);
  const heavyP = makeCustomProduct("income-simple-both", heavyFeeConfig);

  const lightClient = applyCustomProductToClient(baseClient, lightP);
  const heavyClient = applyCustomProductToClient(baseClient, heavyP);

  const lt = runGI(lightClient, lightP);
  const hv = runGI(heavyClient, heavyP);
  note(`0.5% rider: total rider fees=${fmtCents(lt.giMetrics.totalRiderFees)}`);
  note(`3.0% rider: total rider fees=${fmtCents(hv.giMetrics.totalRiderFees)}`);
  assert(
    hv.giMetrics.totalRiderFees > lt.giMetrics.totalRiderFees,
    "Heavier custom rider fee must produce more total rider fees"
  );
  // 6× the rate, applied over similar bases, should land in the 3-7× range
  // (compounding effects on AV reduce the multiplier vs the linear rate ratio).
  const feeRatio = hv.giMetrics.totalRiderFees / Math.max(lt.giMetrics.totalRiderFees, 1);
  note(`Fee ratio = ${feeRatio.toFixed(2)}x`);
  assert(feeRatio >= 3, "6× rate should produce at least 3× cumulative fees");
}

// ============================================================================
// TEST 9: Custom GI payout factors flow through
// ============================================================================
startTest("Custom GI payout factors are APPLIED via customProduct passthrough");
{
  const baseClient = makeClient({
    age: 60,
    income_start_age: 65,
    rate_of_return: 5,
    gi_conversion_years: 5,
  });
  const sched = [9, 8, 7, 6.5, 5.5, 4.5, 3.5, 2.5, 1.5, 0.5];

  // Boring product, identical except for payout factors at age 65
  const lowPayoutConfig: ProductConfigPayload = {
    bonus: { percentage: 14, type: "immediate", applies_to: "both" },
    surrender: { years: 10, schedule: sched },
    fees: { annual_rider_fee: 1.20, fee_duration: "lifetime" },
    withdrawals: { penalty_free_percent: 10, year_1_rule: "same", cumulative_withdrawal: false },
    other: { mva_applies: false },
    form_defaults: { rate_of_return: 5 },
    income: {
      roll_up_type: "simple",
      roll_up_rate: 8,
      roll_up_split_rate: false,
      roll_up_max_years: 10,
      payout_factors: {
        // 4% payout at age 65 — stingy
        single: { "65": 4.0 },
        joint: { "65": 3.5 },
      },
    },
  };
  const highPayoutConfig: ProductConfigPayload = {
    ...lowPayoutConfig,
    income: {
      ...lowPayoutConfig.income!,
      payout_factors: {
        // 9% payout at age 65 — generous
        single: { "65": 9.0 },
        joint: { "65": 8.0 },
      },
    },
  };

  const lowP = makeCustomProduct("income-simple-both", lowPayoutConfig);
  const highP = makeCustomProduct("income-simple-both", highPayoutConfig);

  const lowClient = applyCustomProductToClient(baseClient, lowP);
  const highClient = applyCustomProductToClient(baseClient, highP);

  const lo = runGI(lowClient, lowP);
  const hi = runGI(highClient, highP);

  note(`Low payout (4%):  annual income gross=${fmtCents(lo.giMetrics.annualIncomeGross)}, payout%=${lo.giMetrics.payoutPercent}`);
  note(`High payout (9%): annual income gross=${fmtCents(hi.giMetrics.annualIncomeGross)}, payout%=${hi.giMetrics.payoutPercent}`);
  assert(
    hi.giMetrics.annualIncomeGross > lo.giMetrics.annualIncomeGross,
    "Higher custom payout factor must produce higher annual income"
  );
  // 9/4 = 2.25× — actual income ratio should match closely since income base is same
  const incomeRatio = hi.giMetrics.annualIncomeGross / Math.max(lo.giMetrics.annualIncomeGross, 1);
  note(`Income ratio = ${incomeRatio.toFixed(2)}x`);
  assert(incomeRatio > 2.0, "Income ratio should track payout factor ratio (~2.25×)");
}

// ============================================================================
// TEST 10: Custom GI bonus_applies_to override flows through
// ============================================================================
startTest("Custom bonus_applies_to override redirects bonus targeting");
{
  const baseClient = makeClient({
    age: 60,
    income_start_age: 65,
    rate_of_return: 5,
    gi_conversion_years: 5,
  });
  const sched = [9, 8, 7, 6.5, 5.5, 4.5, 3.5, 2.5, 1.5, 0.5];

  // Same engine_preset (compound-rollup-income → bonusAppliesTo: 'incomeBase' by default)
  // but custom config flips it to 'both' (bonus on AV + IB).
  const ibOnlyConfig: ProductConfigPayload = {
    bonus: { percentage: 20, type: "immediate", applies_to: "income_base" },
    surrender: { years: 10, schedule: sched },
    fees: { annual_rider_fee: 1.25, fee_duration: "lifetime" },
    withdrawals: { penalty_free_percent: 10, year_1_rule: "same", cumulative_withdrawal: false },
    other: { mva_applies: false },
    form_defaults: { rate_of_return: 5 },
    income: {
      roll_up_type: "compound",
      roll_up_rate: 7,
      roll_up_split_rate: false,
      roll_up_max_years: 10,
      bonus_applies_to: "income_base",
      payout_factors: { single: {}, joint: {} },
    },
  };
  const bothConfig: ProductConfigPayload = {
    ...ibOnlyConfig,
    income: {
      ...ibOnlyConfig.income!,
      bonus_applies_to: "both",
    },
  };

  const ibOnlyP = makeCustomProduct("income-compound-split", ibOnlyConfig);
  const bothP = makeCustomProduct("income-compound-split", bothConfig);

  const ibClient = applyCustomProductToClient(baseClient, ibOnlyP);
  const bothClient = applyCustomProductToClient(baseClient, bothP);

  const ib = runGI(ibClient, ibOnlyP);
  const both = runGI(bothClient, bothP);
  note(`bonus_applies_to=income_base: bonusAmount=${fmtCents(ib.giMetrics.bonusAmount)}, target=${ib.giMetrics.bonusAppliesTo}`);
  note(`bonus_applies_to=both:        bonusAmount=${fmtCents(both.giMetrics.bonusAmount)}, target=${both.giMetrics.bonusAppliesTo}`);
  assert(both.giMetrics.bonusAppliesTo === "both", "Custom bonus_applies_to=both must propagate to metrics");
  assert(ib.giMetrics.bonusAppliesTo === "incomeBase", "Custom bonus_applies_to=income_base must propagate to metrics");
  // Note: even though both products charge the same income base × payout factor,
  // 'both' deposits the bonus into AV too, so AV starts ~20% higher → AV depletes
  // later → more lifetime income net of fees. Comparing AV at age 70 (just after
  // purchase + bonus + roll-up year) shows the structural difference.
  const ibPurchaseAV = ib.formulaYears.find((y) => y.age === 65)?.accumulationValue ?? 0;
  const bothPurchaseAV = both.formulaYears.find((y) => y.age === 65)?.accumulationValue ?? 0;
  note(`AV at age 65 (purchase): income_base=${fmtCents(ibPurchaseAV)} vs both=${fmtCents(bothPurchaseAV)}`);
  assert(bothPurchaseAV > ibPurchaseAV, "'both' must produce higher AV at purchase (bonus is deposited into AV)");
}

// ============================================================================
// TEST 11: Sanity — surrender schedule changes affect surrender values
// ============================================================================
startTest("Custom surrender schedule changes affect surrender value mid-period");
{
  const baseClient = makeClient({ end_age: 70 }); // 5-year projection — still in surrender period
  const harshSchedule = [25, 22, 20, 18, 15, 12, 10, 8, 5, 2];
  const mildSchedule = [3, 3, 2, 2, 1, 1, 1, 1, 1, 1];

  const harsh = applyCustomProductToClient(baseClient, {
    engine_preset: "vesting-bonus-growth" as FormulaType,
    config: {
      bonus: { percentage: 14, type: "vesting" },
      surrender: { years: 10, schedule: harshSchedule },
      fees: { annual_rider_fee: 0, fee_duration: "surrender_period" },
      withdrawals: { penalty_free_percent: 10, year_1_rule: "same", cumulative_withdrawal: false },
      other: { mva_applies: false },
      form_defaults: { rate_of_return: 7 },
    },
  });
  const mild = applyCustomProductToClient(baseClient, {
    engine_preset: "vesting-bonus-growth" as FormulaType,
    config: {
      bonus: { percentage: 14, type: "vesting" },
      surrender: { years: 10, schedule: mildSchedule },
      fees: { annual_rider_fee: 0, fee_duration: "surrender_period" },
      withdrawals: { penalty_free_percent: 10, year_1_rule: "same", cumulative_withdrawal: false },
      other: { mva_applies: false },
      form_defaults: { rate_of_return: 7 },
    },
  });

  const a = runGrowth(harsh);
  const b = runGrowth(mild);
  // Final-year IRA balance shouldn't differ much (same rate, same bonus, no withdrawals)
  // but surrender VALUE in year 1-3 should differ. Look at surrenderValue mid-period.
  const harshYr1 = a.formulaYears[0]?.surrenderValue ?? 0;
  const mildYr1 = b.formulaYears[0]?.surrenderValue ?? 0;
  note(`Year 1 surrender value (harsh 25%): ${fmtCents(harshYr1)}`);
  note(`Year 1 surrender value (mild 3%):   ${fmtCents(mildYr1)}`);
  assert(mildYr1 > harshYr1, "Milder schedule should leave higher year-1 surrender value");
}

// ============================================================================
// SUMMARY
// ============================================================================
console.log(`\n${"=".repeat(70)}`);
if (failures === 0) {
  console.log(`✅ All ${testNum} tests passed.`);
} else {
  console.log(`❌ ${failures} test(s) failed out of ${testNum}.`);
}
console.log("=".repeat(70));
