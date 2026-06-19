import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runSimulation, createSimulationInput, runGuaranteedIncomeSimulation, runGrowthSimulation, runAumScenario } from '@/lib/calculations';
import { requestedFromQualifiedForYear } from '@/lib/calculations/utils/withdrawals';
import type { Client } from '@/lib/types/client';
import type { ProjectionInsert, ProjectionResponse } from '@/lib/types/projection';
import type { SimulationResult, YearlyResult } from '@/lib/calculations';
import type { GIMetrics } from '@/lib/calculations/guaranteed-income/types';
import { isGuaranteedIncomeProduct, isGrowthProduct, type FormulaType } from '@/lib/config/products';
import { checkUsageLimit, incrementUsage } from '@/lib/usage';
import { getCustomProduct } from '@/lib/products/repository';
import { getVisibleUserIds } from '@/lib/auth/visibleUserIds';
import type { CustomProductRow } from '@/lib/products/types';
import crypto from 'crypto';

// Increment this when product configurations change (payout tables, roll-up rates, etc.)
// This ensures cached projections are invalidated when we update product data
const PRODUCT_CONFIG_VERSION = 57; // v57: conversion-tax funding fallback. When tax_payment_source='from_taxable' but the client has NO taxable account ($0), the conversion tax now funds from the IRA instead of being silently clamped to $0 (the taxableBalance floor). Pre-fix, ~160 of 197 converting from_taxable clients (mostly the DEFAULT from_taxable + $0 taxable) had their conversion tax vanish — making conversions look tax-free and the bracket ceiling irrelevant to lifetime wealth (John Peterson: 22%/24%/35% all gave an identical $8.95M; post-fix $6.82M/$6.56M/$5.59M). Applied identically in formula.ts, growth-formula.ts, guaranteed-income/engine.ts via `payTaxFromIRA ||= taxable_accounts<=0`. Clients WITH a real taxable balance, and explicit from_ira clients, are unchanged. Residual non-conversion (SS/income) tax still floors at $0 (Jorge V. v53 behavior preserved). Bumping so existing cached projections recompute. // v56: floor the traditional IRA at $0 after conversion + tax in growth-formula.ts. In the depletion year, the fixed_amount/full_conversion tax solvers could size conversion + tax-from-IRA a few dollars above the remaining balance (an iterative-solver rounding residual); iraAfterConversion went slightly negative and the interest step compounded it into a visibly negative "traditional IRA" in later years (Kwanza E. ticket — negatives across multiple fixed-amount, tax-from-IRA scenarios). Bumping the cache version so EXISTING cached projections recompute with the floor (the v55 fix shipped without a bump, so stale negative projections kept serving). Affects only scenarios that fully deplete the IRA via a fixed/full conversion with taxes paid from the IRA; healthy balances unchanged. // v55: "Option B" taxable-account cash-flow fix across ALL THREE engines (baseline, formula, growth-formula), plus a spouse-deduction consistency fix. (1) reinvested/cash RMD treatment now ACCUMULATES the after-tax RMD in the taxable brokerage instead of pinning it at $0. Root cause: each engine deducted the FULL non-RMD/non-conversion tax (tax on SS / non-SSI income) from the brokerage every year; for clients with outside income that tax exceeded the after-tax RMD, drove the balance negative, and the $0-clamp hid it — so reinvested RMDs never accumulated (Marc Kraus, ticket 2a95f2e9). Fix: outside income funds its OWN tax; only the forced RMD's own attributable tax (pro-rated identically to baseline) and externally-paid conversion tax reduce the brokerage; the reinvested-RMD side account grows at the baseline comparison rate. Verified via symmetry harness: a zero-conversion / no-bonus strategy now equals baseline to the dollar on both formula and growth-formula sides; full-conversion strategies (no residual RMDs) are unchanged. (2) baseline.ts + formula.ts now derive the spouse's age-65 senior standard deduction from spouse_age (age-based, falling back to spouse_dob) instead of spouse_dob ONLY — previously age-based married clients (most of them) silently lost the spouse senior deduction in baseline/formula while growth-formula included it, overstating baseline tax and the strategy's apparent advantage. Affects any reinvested/cash client with outside income, and any age-based MFJ client. // v54: New "Total Fed Tax on IRA Withdrawal" YearlyResult field surfaces a single number representing the marginal federal tax cost of the year's full IRA distribution (conversion + gross-up + RMD + voluntary withdrawals), computed as Tax(year-with-distribution) − Tax(year-without-distribution). Pre-fix the only equivalent was summing two display columns ("Fed Tax (Conversions)" + the gross-up portion lumped into "Fed Tax (Ordinary)"), which advisors found confusing — Robert R. ticket a1639792 ("calculated federal tax is only 32.6% on the 120K conversion … if I base the federal tax on the $166,724 then the tax should be 53,351"). The new column is now the answer to that question. Affects display only; no engine math changes — just a new computed field per year. // v53: taxableBalance clamped at $0 in all engines (growth-formula, baseline, formula, guaranteed-income). Pre-fix, once the qualified buckets and the taxable account drained, residual non-conversion tax (on SS / non_ssi_income / etc.) kept driving taxableBalance into the negatives every year — which made the chart legacy line dive deep into negative territory and produced "$0 to heirs" reports for clients with significant external income (Jorge V., ticket 809a5774). The clamp says "if the portfolio has nothing left to fund the residual tax, the client paid it from their living-expense income — the portfolio just stays at zero." Affects: any client where both qualified buckets deplete before end_age while SS / non_ssi_income / pension is still flowing. TODO: a proper fix (option B — credit external income against tax bills before deducting from taxable) would be more accurate but is a bigger rewrite; revisit if the simpler clamp produces a confusing edge case.

function generateInputHash(client: Client, customProduct?: CustomProductRow | null): string {
  const relevantFields = {
    // Config version - bump this when product configs change
    _configVersion: PRODUCT_CONFIG_VERSION,
    // Custom product config — must be in the hash so editing the product
    // invalidates cached projections that used it. We hash the FULL config
    // payload + updated_at so any edit produces a new hash.
    custom_product_id: client.custom_product_id ?? null,
    custom_product_config: customProduct?.config ?? null,
    custom_product_engine_preset: customProduct?.engine_preset ?? null,
    custom_product_updated_at: customProduct?.updated_at ?? null,
    // New Formula fields
    age: client.age,
    qualified_account_value: client.qualified_account_value,
    carrier_name: client.carrier_name,
    product_name: client.product_name,
    bonus_percent: client.bonus_percent,
    rate_of_return: client.rate_of_return,
    anniversary_bonus_percent: client.anniversary_bonus_percent,
    anniversary_bonus_years: client.anniversary_bonus_years,
    constraint_type: client.constraint_type,
    // CRITICAL: include target_irmaa_tier so the advisor changing the IRMAA
    // ceiling tier invalidates the cached projection. Without this, the cache
    // hits on a stale projection and the advisor sees no change after picking
    // a different target tier. Same staleness class of bug as penalty_free_scope.
    target_irmaa_tier: client.target_irmaa_tier,
    tax_rate: client.tax_rate,
    max_tax_rate: client.max_tax_rate,
    ssi_payout_age: client.ssi_payout_age,
    ssi_annual_amount: client.ssi_annual_amount,
    spouse_age: client.spouse_age,
    spouse_ssi_payout_age: client.spouse_ssi_payout_age,
    spouse_ssi_annual_amount: client.spouse_ssi_annual_amount,
    non_ssi_income: client.non_ssi_income,
    withdrawals: client.withdrawals,
    conversion_type: client.conversion_type,
    fixed_conversion_amount: client.fixed_conversion_amount,
    target_partial_amount: client.target_partial_amount,
    respect_penalty_free_limit: client.respect_penalty_free_limit,
    // CRITICAL: include penalty_free_scope so toggling between 'tax_only'
    // and 'all_distributions' invalidates the cached projection. Without
    // this, the cache hits on the old projection and the advisor sees no
    // change in lifetime wealth after switching the scope.
    penalty_free_scope: client.penalty_free_scope,
    protect_initial_premium: client.protect_initial_premium,
    withdrawal_type: client.withdrawal_type,
    surrender_years: client.surrender_years,
    surrender_schedule: client.surrender_schedule,
    penalty_free_percent: client.penalty_free_percent,
    baseline_comparison_rate: client.baseline_comparison_rate,
    post_contract_rate: client.post_contract_rate,
    years_to_defer_conversion: client.years_to_defer_conversion,
    heir_tax_rate: client.heir_tax_rate,
    rmd_treatment: client.rmd_treatment,
    // Toggling this flag changes whether the engine computes RMDs at all
    // — must be in the cache hash or flipping it shows stale projections.
    rmds_handled_externally: client.rmds_handled_externally,
    // widow_death_age is read by widow-penalty analysis to determine the
    // first-death year. Missing from the hash meant advisors editing the
    // "First-Death Age" field saw no change in their projection because
    // the cache hit on the old result. Same staleness class of bug as the
    // penalty_free_scope one.
    widow_death_age: client.widow_death_age,
    // Previously missing — caused stale cache when these fields changed
    tax_payment_source: client.tax_payment_source,
    state_tax_rate: client.state_tax_rate,
    gross_taxable_non_ssi: client.gross_taxable_non_ssi,
    tax_exempt_non_ssi: client.tax_exempt_non_ssi,
    // Must be in the hash or editing the deduction won't recompute the cached
    // projection (it feeds every engine's taxable-income calc).
    additional_deductions: client.additional_deductions,
    // Legacy fields (kept for backwards compatibility)
    traditional_ira: client.traditional_ira,
    roth_ira: client.roth_ira,
    taxable_accounts: client.taxable_accounts,
    date_of_birth: client.date_of_birth,
    spouse_dob: client.spouse_dob,
    filing_status: client.filing_status,
    state: client.state,
    strategy: client.strategy,
    start_age: client.start_age,
    end_age: client.end_age,
    growth_rate: client.growth_rate,
    inflation_rate: client.inflation_rate,
    projection_years: client.projection_years,
    ss_self: client.ss_self,
    ss_spouse: client.ss_spouse,
    pension: client.pension,
    other_income: client.other_income,
    widow_analysis: client.widow_analysis,
    // GI-specific fields
    blueprint_type: client.blueprint_type,
    payout_type: client.payout_type,
    income_start_age: client.income_start_age,
    guaranteed_rate_of_return: client.guaranteed_rate_of_return,
    roll_up_option: client.roll_up_option,
    payout_option: client.payout_option,
    // GI 4-phase model fields
    gi_conversion_years: client.gi_conversion_years,
    gi_conversion_bracket: client.gi_conversion_bracket,
    // AUM split-allocation
    aum_allocation_percent: client.aum_allocation_percent,
    aum_fee_percent: client.aum_fee_percent,
    aum_dividend_yield: client.aum_dividend_yield,
    aum_turnover_percent: client.aum_turnover_percent,
    aum_withdrawal_years: client.aum_withdrawal_years,
    aum_growth_rate: client.aum_growth_rate,
    ltcg_rate: client.ltcg_rate,
  };
  return crypto.createHash('sha256').update(JSON.stringify(relevantFields)).digest('hex');
}

// Map conversion_type to strategy name for display
function getStrategyFromConversionType(conversionType?: string): string {
  switch (conversionType) {
    case 'optimized_amount': return 'moderate';
    case 'partial_amount': return 'moderate'; // Partial is bracket-fill capped at total — same risk profile as optimized
    case 'fixed_amount': return 'conservative';
    case 'full_conversion': return 'aggressive';
    case 'no_conversion': return 'conservative';
    default: return 'moderate';
  }
}

/**
 * Combine the Roth-side YearlyResult array with the AUM-side YearlyResult
 * array element-wise. Used by the split-allocation feature so the dashboard's
 * existing display logic (which reads blueprint_years for the strategy
 * column) sees one combined trajectory across both buckets.
 *
 * Sums balances + cash flows; adopts the Roth side for "who's the client"
 * fields like spouseAge, totalIncome breakdowns, etc. The AUM-only array is
 * stored separately so the report can show the bucket-level breakdown.
 */
function combineRothAndAum(roth: YearlyResult[], aum: YearlyResult[]): YearlyResult[] {
  const length = Math.min(roth.length, aum.length);
  const combined: YearlyResult[] = [];
  for (let i = 0; i < length; i++) {
    const r = roth[i];
    const a = aum[i];
    combined.push({
      // Identifiers come from the Roth side — they're the same calendar
      // year/age either way.
      year: r.year,
      age: r.age,
      spouseAge: r.spouseAge,

      // Balances: sum across both buckets.
      traditionalBalance: r.traditionalBalance + a.traditionalBalance,
      rothBalance: r.rothBalance + a.rothBalance,
      taxableBalance: r.taxableBalance + a.taxableBalance,

      // Cash flows
      rmdAmount: r.rmdAmount + a.rmdAmount,
      conversionAmount: r.conversionAmount + a.conversionAmount,
      ssIncome: r.ssIncome,
      pensionIncome: r.pensionIncome,
      otherIncome: r.otherIncome,
      totalIncome: r.totalIncome + (a.totalIncome ?? 0),

      // Taxes — both engines compute their own slice. Sum.
      federalTax: r.federalTax + a.federalTax,
      stateTax: r.stateTax + a.stateTax,
      niitTax: r.niitTax + a.niitTax,
      irmaaSurcharge: r.irmaaSurcharge + a.irmaaSurcharge,
      totalTax: r.totalTax + a.totalTax,

      taxableSS: r.taxableSS,
      netWorth: r.netWorth + a.netWorth,

      // Surrender / cumulative — Roth side authoritative
      surrenderChargePercent: r.surrenderChargePercent,
      surrenderValue: r.surrenderValue,
      cumulativeDistributions: r.cumulativeDistributions,

      // Extended fields — sum where both buckets contribute
      traditionalBOY: (r.traditionalBOY ?? 0) + (a.traditionalBOY ?? 0),
      rothBOY: (r.rothBOY ?? 0) + (a.rothBOY ?? 0),
      taxableBOY: (r.taxableBOY ?? 0) + (a.taxableBOY ?? 0),
      traditionalGrowth: (r.traditionalGrowth ?? 0) + (a.traditionalGrowth ?? 0),
      rothGrowth: (r.rothGrowth ?? 0) + (a.rothGrowth ?? 0),
      taxableGrowth: (r.taxableGrowth ?? 0) + (a.taxableGrowth ?? 0),
      productBonusApplied: r.productBonusApplied,
      // AGI/MAGI/taxableIncome must include the AUM-side IRA pull — that
      // withdrawal IS taxable income at the IRS level. Without this the
      // combined row showed Total Income > AGI by tens of thousands when
      // both buckets are active, which is impossible by definition (AGI
      // can only differ from total income by adjustments, not by missing
      // entire income streams). Note: this is a DISPLAY consolidation —
      // each engine still computes tax on its own slice independently
      // (cross-engine bracket stacking is a v2 concern, see WISHLIST).
      magi: (r.magi ?? 0) + ((a.iraWithdrawal ?? 0)),
      agi: (r.agi ?? 0) + ((a.iraWithdrawal ?? 0)),
      standardDeduction: r.standardDeduction,
      taxableIncome: (r.taxableIncome ?? 0) + ((a.iraWithdrawal ?? 0)),
      federalTaxBracket: r.federalTaxBracket,
      irmaaTier: r.irmaaTier,
      federalTaxOnSS: r.federalTaxOnSS,
      federalTaxOnConversions: r.federalTaxOnConversions,
      federalTaxOnOrdinaryIncome: (r.federalTaxOnOrdinaryIncome ?? 0) + (a.federalTaxOnOrdinaryIncome ?? 0),
      stateTaxOnSS: r.stateTaxOnSS,
      stateTaxOnConversions: r.stateTaxOnConversions,
      stateTaxOnOrdinaryIncome: (r.stateTaxOnOrdinaryIncome ?? 0) + (a.stateTaxOnOrdinaryIncome ?? 0),
      totalIRAWithdrawal: (r.totalIRAWithdrawal ?? 0) + (a.totalIRAWithdrawal ?? 0),
      taxesPaidFromIRA: r.taxesPaidFromIRA,
      // Both engines can produce early-withdrawal penalties (Roth side: when
      // tax is paid from the IRA under 59½; AUM side: on every IRA-to-AUM
      // pull under 59½). Sum so the dashboard sees the full lifetime amount.
      earlyWithdrawalPenalty: (r.earlyWithdrawalPenalty ?? 0) + (a.earlyWithdrawalPenalty ?? 0),
      iraWithdrawal: (r.iraWithdrawal ?? 0) + (a.iraWithdrawal ?? 0),
      rothWithdrawal: r.rothWithdrawal,
      // AUM bucket subset fields — surface the AUM-side numbers separately
      // so the year-by-year deep-dive table can show "AUM Bucket Balance,"
      // "AUM Transfer," and "AUM Tax" columns without the advisor having to
      // mentally subtract the AUM portion out of taxableBalance / iraWithdrawal.
      aumBalance: a.taxableBalance,
      aumTransfer: a.iraWithdrawal ?? 0,
      aumTax: a.totalTax,
      // Brokerage-spending withdrawal absorbed by the AUM bucket (the
      // shortfall the Roth-side IRA couldn't satisfy because of the
      // allocation split). Already reflected in taxableBalance reduction —
      // this field is for narration / dashboard tooltips.
      aumScheduledWithdrawal: a.aumScheduledWithdrawal ?? 0,

      // GI fields stay on the Roth side
      incomeRiderValue: r.incomeRiderValue,
      accumulationValue: r.accumulationValue,
      incomePayoutAmount: r.incomePayoutAmount,
      riderFee: r.riderFee,
      giPhase: r.giPhase,
      giIncomeNet: r.giIncomeNet,
      giCumulativeIncome: r.giCumulativeIncome,
      giRollUpGrowth: r.giRollUpGrowth,
      giPayoutRate: r.giPayoutRate,
      giConversionTax: r.giConversionTax,
    });
  }
  return combined;
}

function simulationToProjection(
  clientId: string,
  userId: string,
  client: Client,
  result: SimulationResult,
  inputHash: string,
  giMetrics?: GIMetrics,
  aumYears: YearlyResult[] | null = null,
): ProjectionInsert {
  const lastBaseline = result.baseline[result.baseline.length - 1];
  const lastFormula = result.formula[result.formula.length - 1];
  const lastAum = aumYears && aumYears.length > 0 ? aumYears[aumYears.length - 1] : null;

  // Determine strategy from conversion_type or legacy strategy field
  const strategy = client.conversion_type
    ? getStrategyFromConversionType(client.conversion_type)
    : (client.strategy ?? 'moderate');

  // Calculate projection years from end_age - age or use legacy field
  const projectionYears = client.age && client.end_age
    ? client.end_age - client.age
    : (client.projection_years ?? 30);

  return {
    client_id: clientId,
    user_id: userId,
    input_hash: inputHash,
    break_even_age: result.breakEvenAge,
    total_tax_savings: result.totalTaxSavings,
    heir_benefit: result.heirBenefit,
    baseline_final_traditional: lastBaseline.traditionalBalance,
    baseline_final_roth: lastBaseline.rothBalance,
    baseline_final_taxable: lastBaseline.taxableBalance,
    baseline_final_net_worth: lastBaseline.netWorth,
    blueprint_final_traditional: lastFormula.traditionalBalance,
    blueprint_final_roth: lastFormula.rothBalance,
    blueprint_final_taxable: lastFormula.taxableBalance,
    blueprint_final_net_worth: lastFormula.netWorth,
    baseline_years: result.baseline,
    blueprint_years: result.formula,
    strategy,
    projection_years: projectionYears,
    // GI-specific metrics (null for Growth products)
    gi_annual_income_gross: giMetrics?.annualIncomeGross ?? null,
    gi_annual_income_net: giMetrics?.annualIncomeNet ?? null,
    gi_income_start_age: giMetrics?.incomeStartAge ?? null,
    gi_depletion_age: giMetrics?.depletionAge ?? null,
    gi_income_base_at_start: giMetrics?.incomeBaseAtStart ?? null,
    gi_income_base_at_income_age: giMetrics?.incomeBaseAtIncomeAge ?? null,
    gi_total_gross_paid: giMetrics?.totalGrossPaid ?? null,
    gi_total_net_paid: giMetrics?.totalNetPaid ?? null,
    gi_yearly_data: giMetrics?.yearlyData ?? null,
    gi_total_rider_fees: giMetrics?.totalRiderFees ?? null,
    gi_payout_percent: giMetrics?.payoutPercent ?? null,
    gi_roll_up_description: giMetrics?.rollUpDescription ?? null,
    // GI 4-phase model fields
    gi_conversion_phase_years: giMetrics?.conversionPhaseYears ?? null,
    gi_purchase_age: giMetrics?.purchaseAge ?? null,
    gi_purchase_amount: giMetrics?.purchaseAmount ?? null,
    gi_total_conversion_tax: giMetrics?.totalConversionTax ?? null,
    gi_deferral_years: giMetrics?.deferralYears ?? null,
    // GI comparison metrics
    gi_strategy_annual_income_net: giMetrics?.comparison?.strategyAnnualIncomeNet ?? null,
    gi_baseline_annual_income_gross: giMetrics?.comparison?.baselineAnnualIncomeGross ?? null,
    gi_baseline_annual_income_net: giMetrics?.comparison?.baselineAnnualIncomeNet ?? null,
    gi_baseline_annual_tax: giMetrics?.comparison?.baselineAnnualTax ?? null,
    gi_baseline_income_base: giMetrics?.comparison?.baselineIncomeBase ?? null,
    gi_annual_income_advantage: giMetrics?.comparison?.annualIncomeAdvantage ?? null,
    gi_lifetime_income_advantage: giMetrics?.comparison?.lifetimeIncomeAdvantage ?? null,
    gi_tax_free_wealth_created: giMetrics?.comparison?.taxFreeWealthCreated ?? null,
    gi_break_even_years: giMetrics?.comparison?.breakEvenYears ?? null,
    gi_break_even_age: giMetrics?.comparison?.breakEvenAge ?? null,
    gi_percent_improvement: giMetrics?.comparison?.percentImprovement ?? null,
    gi_baseline_yearly_data: giMetrics?.baselineYearlyData ?? null,

    // AUM bucket — null when split-allocation isn't active.
    aum_years: aumYears,
    aum_final_balance: lastAum ? lastAum.taxableBalance : null,
  };
}

/**
 * Run the AUM bucket if the client has aum_allocation_percent > 0, then
 * return the combined Roth+AUM YearlyResult array (replacing result.formula)
 * + the AUM-only array stored separately.
 *
 * The Roth engine still ran on the SPLIT slice — we don't re-run it here.
 * What we do is take its already-computed strategy years and fold the AUM
 * bucket on top, so blueprint_years carries the combined trajectory.
 *
 * IRA-side shortfall plumbing: when the user schedules `client.withdrawals`
 * but the AUM allocation pushed the Roth-side IRA balance below the
 * requested amount, the Roth engine silently clipped the withdrawal to $0.
 * We compute the per-year shortfall (requested-from-qualified MINUS what
 * the Roth side actually pulled) and pass it into the AUM engine so the
 * brokerage absorbs the difference. This is the fix for ticket 34b54286
 * ("100% AUM, $138K/yr withdrawals, much less shows up in chart").
 */
function runAumOverlay(client: Client, result: SimulationResult): { combinedFormula: YearlyResult[]; aumYears: YearlyResult[] | null } {
  const pct = client.aum_allocation_percent ?? 0;
  if (pct <= 0) return { combinedFormula: result.formula, aumYears: null };

  const startingIraPortion = Math.round((client.qualified_account_value ?? 0) * (pct / 100));
  if (startingIraPortion <= 0) return { combinedFormula: result.formula, aumYears: null };

  const startYear = result.formula[0]?.year ?? new Date().getFullYear();
  const projectionYears = result.formula.length;

  // Build per-year IRA-side shortfall: what the Roth-side engine couldn't
  // satisfy. We count both 'ira'-source and 'auto'-source entries, since
  // 'auto' falls through to IRA after Roth is exhausted; the Roth side's
  // (iraWithdrawal + rothWithdrawal) is the real-world satisfied amount
  // for that pair of sources. 'roth'-only entries are excluded — the AUM
  // brokerage isn't a Roth substitute.
  const iraShortfallByYear = new Map<number, number>();
  for (const ry of result.formula) {
    const requested = requestedFromQualifiedForYear(client, ry.year);
    if (requested <= 0) continue;
    const satisfied = (ry.iraWithdrawal ?? 0) + (ry.rothWithdrawal ?? 0);
    const shortfall = Math.max(0, requested - satisfied);
    if (shortfall > 0) iraShortfallByYear.set(ry.year, shortfall);
  }

  const aumYears = runAumScenario({
    startingIraPortion,
    client,
    startYear,
    projectionYears,
    iraShortfallByYear,
  });

  const combinedFormula = combineRothAndAum(result.formula, aumYears);
  return { combinedFormula, aumYears };
}

/**
 * Build a "split client" — a shallow copy of the client whose
 * qualified_account_value is reduced to the Roth-side slice. Used so the
 * existing Roth engines run on the right starting balance when split
 * allocation is on.
 */
function buildRothSideClient(client: Client): Client {
  const pct = client.aum_allocation_percent ?? 0;
  if (pct <= 0) return client;
  const reduced = Math.round((client.qualified_account_value ?? 0) * (1 - pct / 100));
  return { ...client, qualified_account_value: reduced };
}

/**
 * Conversion-tax funding fallback for the PARTIAL-taxable case.
 *
 * The engines already fund conversion tax from the IRA when the taxable account
 * is exactly $0. But when the account is POSITIVE yet smaller than the
 * conversion tax, a 'from_taxable' client drains it and the engine silently
 * clamps the excess to $0 — making conversions look tax-free and inflating
 * wealth (the "$0 → $1 cliff": a client with a tiny taxable balance jumps back
 * to the inflated number). A per-year clamp-site patch can't fix this because
 * the conversion SIZE must also shrink (the optimizer grosses the conversion
 * down only when paying from the IRA), so we re-run the STRATEGY funding from
 * the IRA — reusing the fully-tested gross-down path — and keep the original
 * baseline (do-nothing, no conversions) so the comparison stays fair.
 *
 * No-op when the engine already handles it (from_ira / $0 taxable), when the
 * taxable account covers the conversion tax, or when there's no conversion.
 */
function fundConvTaxFromIraIfShort<T extends SimulationResult>(
  client: Client,
  rothSideClient: Client,
  customProduct: CustomProductRow | null,
  run: (input: ReturnType<typeof createSimulationInput>) => T,
  firstPass: T,
): T {
  const taxable = client.taxable_accounts ?? 0;
  if (client.tax_payment_source === 'from_ira' || taxable <= 0) return firstPass;
  const convTax = firstPass.formula.reduce(
    (sum, y) => sum + (y.federalTaxOnConversions ?? 0) + (y.stateTaxOnConversions ?? 0),
    0,
  );
  if (convTax <= 0 || taxable >= convTax) return firstPass;
  const reRun = run(
    createSimulationInput({ ...rothSideClient, tax_payment_source: 'from_ira' }, customProduct),
  );
  return { ...reRun, baseline: firstPass.baseline };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await context.params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Scope by ownership (viewer + team_owner). Admins do NOT pull other
    // advisors' projections through this route — same Sharon-Veasie reason.
    const visibleUserIds = await getVisibleUserIds(supabase, user.id);
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .in('user_id', visibleUserIds)
      .single();

    if (clientError) {
      if (clientError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 });
      }
      throw clientError;
    }

    // Load the custom product config (if any) BEFORE hashing — its updated_at
    // and config must be part of the cache key so edits invalidate.
    // Look it up under the CLIENT'S owner, not the viewer — when a team
    // member views the team_owner's client, the custom_product_id belongs
    // to the owner. Looking it up under the viewer would silently return
    // null and the projection would fall back to system defaults (wrong
    // bonus %, surrender schedule, etc.).
    const typedClient = client as Client;
    const customProduct = typedClient.custom_product_id
      ? await getCustomProduct(typedClient.user_id, typedClient.custom_product_id)
      : null;

    const inputHash = generateInputHash(typedClient, customProduct);

    // Check cache
    const { data: existingProjection } = await supabase
      .from('projections')
      .select('*')
      .eq('client_id', clientId)
      .eq('input_hash', inputHash)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existingProjection) {
      return NextResponse.json({ projection: existingProjection, cached: true } as ProjectionResponse);
    }

    // Check scenario run limit (only for non-cached runs)
    const usageCheck = await checkUsageLimit(user.id, 'scenario_runs');
    if (!usageCheck.allowed) {
      return NextResponse.json(
        {
          error: 'Scenario limit reached',
          message: `You've used ${usageCheck.current}/${usageCheck.limit} scenarios this month. Upgrade to Pro for unlimited scenarios.`,
          current: usageCheck.current,
          limit: usageCheck.limit,
          showUpgrade: true,
        },
        { status: 403 }
      );
    }

    // Run simulation - dispatch to GI or standard engine based on product type.
    // customProduct (loaded above) is passed through so the resolver can overlay
    // its config on top of the system preset for engine-internal data.
    //
    // When client.aum_allocation_percent > 0, we additionally:
    //   1. Run the chosen Roth engine on the REDUCED slice (Roth side)
    //   2. Run the AUM engine on the AUM slice
    //   3. Combine year-by-year so blueprint_years reflects the FULL strategy
    //   The baseline always runs on the full IRA — that's the "do nothing"
    //   comparison the advisor wants to anchor against.
    const formulaType = typedClient.blueprint_type as FormulaType;
    const isGI = formulaType && isGuaranteedIncomeProduct(formulaType);
    const rothSideClient = buildRothSideClient(typedClient);
    const baselineSimInput = createSimulationInput(typedClient, customProduct);
    const rothSimInput = createSimulationInput(rothSideClient, customProduct);
    let projectionInsert: ProjectionInsert;
    if (isGI) {
      // For GI products with split-allocation, the GI calculation also needs
      // to run against the reduced Roth-side balance. The baseline-side of
      // the GI result is replaced with a full-balance baseline below so the
      // "do nothing" comparison stays honest.
      let giSplitResult = runGuaranteedIncomeSimulation(rothSimInput);
      giSplitResult = fundConvTaxFromIraIfShort(typedClient, rothSideClient, customProduct, runGuaranteedIncomeSimulation, giSplitResult);
      const baselineFull = (typedClient.aum_allocation_percent ?? 0) > 0
        ? runGuaranteedIncomeSimulation(baselineSimInput).baseline
        : giSplitResult.baseline;
      const splitWithFullBaseline = { ...giSplitResult, baseline: baselineFull };
      const { combinedFormula, aumYears } = runAumOverlay(typedClient, splitWithFullBaseline);
      const finalResult = { ...splitWithFullBaseline, formula: combinedFormula };
      projectionInsert = simulationToProjection(clientId, user.id, typedClient, finalResult, inputHash, giSplitResult.giMetrics, aumYears);
    } else if (isGrowthProduct(formulaType)) {
      let splitResult = runGrowthSimulation(rothSimInput);
      splitResult = fundConvTaxFromIraIfShort(typedClient, rothSideClient, customProduct, runGrowthSimulation, splitResult);
      const baselineFull = (typedClient.aum_allocation_percent ?? 0) > 0
        ? runGrowthSimulation(baselineSimInput).baseline
        : splitResult.baseline;
      const splitWithFullBaseline = { ...splitResult, baseline: baselineFull };
      const { combinedFormula, aumYears } = runAumOverlay(typedClient, splitWithFullBaseline);
      const finalResult = { ...splitWithFullBaseline, formula: combinedFormula };
      projectionInsert = simulationToProjection(clientId, user.id, typedClient, finalResult, inputHash, undefined, aumYears);
    } else {
      let splitResult = runSimulation(rothSimInput);
      splitResult = fundConvTaxFromIraIfShort(typedClient, rothSideClient, customProduct, runSimulation, splitResult);
      const baselineFull = (typedClient.aum_allocation_percent ?? 0) > 0
        ? runSimulation(baselineSimInput).baseline
        : splitResult.baseline;
      const splitWithFullBaseline = { ...splitResult, baseline: baselineFull };
      const { combinedFormula, aumYears } = runAumOverlay(typedClient, splitWithFullBaseline);
      const finalResult = { ...splitWithFullBaseline, formula: combinedFormula };
      projectionInsert = simulationToProjection(clientId, user.id, typedClient, finalResult, inputHash, undefined, aumYears);
    }

    const { data: newProjection, error: insertError } = await supabase
      .from('projections')
      .insert(projectionInsert)
      .select()
      .single();

    if (insertError) throw insertError;

    // Increment usage (fire-and-forget)
    incrementUsage(user.id, 'scenario_runs').catch(console.error);

    return NextResponse.json({ projection: newProjection, cached: false } as ProjectionResponse);
  } catch (error) {
    console.error('Projection error:', error);
    return NextResponse.json({ error: 'Failed to generate projection' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await context.params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Same ownership scope as GET — see comment there for why.
    const visibleUserIdsForPost = await getVisibleUserIds(supabase, user.id);
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .in('user_id', visibleUserIdsForPost)
      .single();

    if (clientError) {
      if (clientError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 });
      }
      throw clientError;
    }

    // Check scenario run limit (POST always recalculates)
    const usageCheck = await checkUsageLimit(user.id, 'scenario_runs');
    if (!usageCheck.allowed) {
      return NextResponse.json(
        {
          error: 'Scenario limit reached',
          message: `You've used ${usageCheck.current}/${usageCheck.limit} scenarios this month. Upgrade to Pro for unlimited scenarios.`,
          current: usageCheck.current,
          limit: usageCheck.limit,
          showUpgrade: true,
        },
        { status: 403 }
      );
    }

    const typedClient = client as Client;
    // Look up the custom product under the CLIENT'S owner — same reason as
    // the GET handler. Team members would otherwise lose the configured
    // carrier values and silently get system defaults.
    const customProduct = typedClient.custom_product_id
      ? await getCustomProduct(typedClient.user_id, typedClient.custom_product_id)
      : null;

    const inputHash = generateInputHash(typedClient, customProduct);
    // Same split-allocation flow as the GET handler — runs the chosen Roth
    // engine on the reduced slice, the AUM engine on the AUM slice, combines
    // them, and stores aum_years separately.
    const formulaType = typedClient.blueprint_type as FormulaType;
    const isGI = formulaType && isGuaranteedIncomeProduct(formulaType);
    const rothSideClient = buildRothSideClient(typedClient);
    const baselineSimInput = createSimulationInput(typedClient, customProduct);
    const rothSimInput = createSimulationInput(rothSideClient, customProduct);

    let projectionInsert: ProjectionInsert;
    if (isGI) {
      let giSplitResult = runGuaranteedIncomeSimulation(rothSimInput);
      giSplitResult = fundConvTaxFromIraIfShort(typedClient, rothSideClient, customProduct, runGuaranteedIncomeSimulation, giSplitResult);
      const baselineFull = (typedClient.aum_allocation_percent ?? 0) > 0
        ? runGuaranteedIncomeSimulation(baselineSimInput).baseline
        : giSplitResult.baseline;
      const splitWithFullBaseline = { ...giSplitResult, baseline: baselineFull };
      const { combinedFormula, aumYears } = runAumOverlay(typedClient, splitWithFullBaseline);
      const finalResult = { ...splitWithFullBaseline, formula: combinedFormula };
      projectionInsert = simulationToProjection(clientId, user.id, typedClient, finalResult, inputHash, giSplitResult.giMetrics, aumYears);
    } else if (isGrowthProduct(formulaType)) {
      let splitResult = runGrowthSimulation(rothSimInput);
      splitResult = fundConvTaxFromIraIfShort(typedClient, rothSideClient, customProduct, runGrowthSimulation, splitResult);
      const baselineFull = (typedClient.aum_allocation_percent ?? 0) > 0
        ? runGrowthSimulation(baselineSimInput).baseline
        : splitResult.baseline;
      const splitWithFullBaseline = { ...splitResult, baseline: baselineFull };
      const { combinedFormula, aumYears } = runAumOverlay(typedClient, splitWithFullBaseline);
      const finalResult = { ...splitWithFullBaseline, formula: combinedFormula };
      projectionInsert = simulationToProjection(clientId, user.id, typedClient, finalResult, inputHash, undefined, aumYears);
    } else {
      let splitResult = runSimulation(rothSimInput);
      splitResult = fundConvTaxFromIraIfShort(typedClient, rothSideClient, customProduct, runSimulation, splitResult);
      const baselineFull = (typedClient.aum_allocation_percent ?? 0) > 0
        ? runSimulation(baselineSimInput).baseline
        : splitResult.baseline;
      const splitWithFullBaseline = { ...splitResult, baseline: baselineFull };
      const { combinedFormula, aumYears } = runAumOverlay(typedClient, splitWithFullBaseline);
      const finalResult = { ...splitWithFullBaseline, formula: combinedFormula };
      projectionInsert = simulationToProjection(clientId, user.id, typedClient, finalResult, inputHash, undefined, aumYears);
    }

    const { data: newProjection, error: insertError } = await supabase
      .from('projections')
      .insert(projectionInsert)
      .select()
      .single();

    if (insertError) throw insertError;

    // Increment usage (fire-and-forget)
    incrementUsage(user.id, 'scenario_runs').catch(console.error);

    return NextResponse.json({ projection: newProjection, cached: false } as ProjectionResponse);
  } catch (error) {
    console.error('Projection error:', error);
    return NextResponse.json({ error: 'Failed to generate projection' }, { status: 500 });
  }
}
