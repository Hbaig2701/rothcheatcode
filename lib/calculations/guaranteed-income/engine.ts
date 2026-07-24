/**
 * Guaranteed Income Calculation Engine - 4-Phase Model
 *
 * The core value proposition: Tax-free guaranteed income for life.
 * Strategy: Convert to Roth FIRST, then buy GI inside the Roth.
 * Baseline: Buy GI directly in Traditional IRA (taxable income).
 *
 * 4-PHASE ARCHITECTURE:
 * Phase 1 (Conversion): Convert Traditional IRA to Roth over N years
 * Phase 2 (Purchase): Use full Roth balance to buy GI FIA inside Roth
 * Phase 3 (Deferral): Income Base grows via roll-up, rider fees apply
 * Phase 4 (Income): Tax-FREE guaranteed income for life
 *
 * BASELINE COMPARISON:
 * Same GI product purchased directly in Traditional IRA.
 * Same deferral period, same roll-up, same payout rate.
 * BUT: Income is TAXABLE.
 *
 * All monetary values are in cents (integers).
 */

import type { Client } from '@/lib/types/client';
import type { SimulationInput, SimulationResult, YearlyResult } from '../types';
import type {
  GIMetrics,
  GIYearData,
  GIComparisonMetrics,
  GIStrategyMetrics,
  GIBaselineMetrics,
} from './types';
import { calculateAge, getAgeAtYearOffset, getBirthYearFromAge } from '../utils/age';
import {
  calculateFederalTax,
  calculateTaxableIncome,
} from '../modules/federal-tax';
import { calculateStateTax } from '../modules/state-tax';
import { calculateIRMAAWithLookback } from '../modules/irmaa';
import { calculateRMD } from '../modules/rmd';
import { getEffectiveDeduction } from '@/lib/data/standard-deductions';
import { getStateTaxRate } from '@/lib/data/states';
import { type GIProductData } from '@/lib/config/gi-product-data';
import type { GuaranteedIncomeFormulaType } from '@/lib/config/products';
import {
  getEffectiveGIData,
  getEffectivePayoutFactor,
  getEffectiveRollUpForYear,
  getEffectiveIncreasingIncomeRate,
} from '../resolvers/product-resolver';
import { resolveWithdrawalsForYear, earlyWithdrawalPenaltyOnIRA } from '../utils/withdrawals';
import { applyTaxCreditCarryforward } from '../utils/tax-credits';
import type { CustomProductRow } from '@/lib/products/types';
import { getNonSSIIncomeForYear, getTaxExemptIncomeForYear } from '../utils/income';
import { calculateMAGI, calculateAGI, getMarginalBracket, computeTaxableIncomeWithSS } from '../tax-helpers';

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

function calculateBreakEvenAge(baseline: YearlyResult[], formula: YearlyResult[]): number | null {
  for (let i = 0; i < baseline.length; i++) {
    if (formula[i].netWorth > baseline[i].netWorth) {
      return formula[i].age;
    }
  }
  return null;
}

function calculateTaxSavings(baseline: YearlyResult[], formula: YearlyResult[]): number {
  const baselineTotalTax = baseline.reduce((s, y) => s + y.totalTax, 0);
  const formulaTotalTax = formula.reduce((s, y) => s + y.totalTax, 0);
  return baselineTotalTax - formulaTotalTax;
}

function calculateHeirBenefit(
  baseline: YearlyResult[],
  formula: YearlyResult[],
  heirTaxRate: number
): number {
  const heirRate = (heirTaxRate ?? 40) / 100;
  const lastBase = baseline[baseline.length - 1];
  const lastFormula = formula[formula.length - 1];

  // Baseline holds a TRADITIONAL annuity — its death benefit is taxable to heirs.
  const baseHeirTax = Math.round(lastBase.traditionalBalance * heirRate);

  // Strategy holds a ROTH annuity (converted first, bought inside the Roth). Its
  // account value is mapped into `traditionalBalance` for chart compatibility,
  // but it is TAX-FREE to heirs — taxing it at the heir rate (the old behavior)
  // erased the entire GI Roth legacy advantage (audit F17, P0). Only tax it if
  // the projection ends DURING the conversion phase, when a real Traditional IRA
  // balance still remains (no annuity purchased yet).
  const strategyStillTraditional = lastFormula.giPhase === 'conversion';
  const blueHeirTax = strategyStillTraditional
    ? Math.round(lastFormula.traditionalBalance * heirRate)
    : 0;

  return baseHeirTax - blueHeirTax;
}

// ---------------------------------------------------------------------------
// Main GI Simulation
// ---------------------------------------------------------------------------

export function runGuaranteedIncomeSimulation(
  input: SimulationInput
): SimulationResult & { giMetrics: GIMetrics } {
  const { client, startYear, endYear, customProduct } = input;
  const projectionYears = endYear - startYear + 1;

  // Run STRATEGY: Convert First, Then Roth GI (tax-free income)
  const { formula, strategyMetrics, strategyGIYearlyData } = runGIStrategyScenario(
    client,
    startYear,
    projectionYears,
    customProduct
  );

  // Run BASELINE: Traditional GI (taxable income)
  const { baseline, baselineMetrics, baselineGIYearlyData } = runGIBaselineScenario(
    client,
    startYear,
    projectionYears,
    strategyMetrics,
    customProduct
  );

  // Comparison metrics use the engine's actual year-by-year bracket-aware
  // baseline figures (already computed in runGIBaselineScenario via
  // calculateFederalTax + calculateStateTax + IRMAA). No flat-rate override.
  const endAge = client.end_age ?? 100;
  const comparison = calculateComparisonMetrics(strategyMetrics, baselineMetrics, endAge);

  // Build GIMetrics object
  const giMetrics: GIMetrics = {
    annualIncomeGross: strategyMetrics.annualIncomeGross,
    annualIncomeNet: strategyMetrics.annualIncomeNet, // Same as gross for Roth GI!
    incomeStartAge: strategyMetrics.incomeStartAge,
    depletionAge: findDepletionAge(strategyGIYearlyData),
    incomeBaseAtStart: strategyMetrics.incomeBaseAtStart,
    incomeBaseAtIncomeAge: strategyMetrics.incomeBaseAtIncomeAge,
    totalGrossPaid: strategyMetrics.lifetimeIncomeGross,
    totalNetPaid: strategyMetrics.lifetimeIncomeNet,
    yearlyData: strategyGIYearlyData,
    totalRiderFees: strategyMetrics.totalRiderFees,
    payoutPercent: strategyMetrics.payoutPercent,
    rollUpDescription: strategyMetrics.rollUpDescription,
    bonusAmount: strategyMetrics.bonusAmount,
    bonusAppliesTo: strategyMetrics.bonusAppliesTo,

    // New 4-phase model fields
    conversionPhaseYears: strategyMetrics.conversionPhaseYears,
    purchaseAge: strategyMetrics.purchaseAge,
    purchaseAmount: strategyMetrics.purchaseAmount,
    totalConversionTax: strategyMetrics.totalConversionTax,
    deferralYears: strategyMetrics.deferralYears,

    // Comparison metrics
    comparison,

    // Baseline data
    baselineYearlyData: baselineGIYearlyData,
  };

  return {
    baseline,
    formula,
    breakEvenAge: calculateBreakEvenAge(baseline, formula),
    totalTaxSavings: calculateTaxSavings(baseline, formula),
    heirBenefit: calculateHeirBenefit(baseline, formula, client.heir_tax_rate ?? 40),
    giMetrics,
  };
}

function findDepletionAge(yearlyData: GIYearData[]): number | null {
  for (const year of yearlyData) {
    if (year.phase === 'income' && year.accountValue <= 0) {
      return year.age;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// STRATEGY SCENARIO: Convert First, Then Roth GI
// ---------------------------------------------------------------------------

function runGIStrategyScenario(
  client: Client,
  startYear: number,
  projectionYears: number,
  customProduct?: CustomProductRow | null
): {
  formula: YearlyResult[];
  strategyMetrics: GIStrategyMetrics & {
    incomeBaseAtStart: number;
    totalRiderFees: number;
    payoutPercent: number;
    rollUpDescription: string;
    bonusAmount: number;
    bonusAppliesTo: string | null;
  };
  strategyGIYearlyData: GIYearData[];
} {
  const results: YearlyResult[] = [];
  const giYearlyData: GIYearData[] = [];

  // --- Product config (custom product overrides system preset via resolver) ---
  const productId = client.blueprint_type as GuaranteedIncomeFormulaType;
  const productData: GIProductData | undefined = getEffectiveGIData(productId, customProduct);

  // --- Age setup ---
  const useAgeBased = client.age !== undefined && client.age > 0;
  const clientAge = useAgeBased ? client.age : 62;

  // --- Rates ---
  const rateOfReturn = (client.rate_of_return ?? 7) / 100;

  // --- GI timing ---
  // Legacy / no-income mode: push the income start age beyond any projection so
  // the income phase never triggers. The annuity is converted to Roth and held;
  // the benefit base rolls up (to its max period) and is the tax-free death
  // benefit to heirs. No lifetime income, no RMDs.
  // Birth year drives the SECURE-Act RMD start age (73 vs 75). A client can
  // still hold a Traditional balance during the conversion window at 73+, and
  // RMDs are "first dollars out" — they can't be converted.
  const birthYear = getBirthYearFromAge(clientAge, startYear);

  const LEGACY_NO_INCOME_AGE = 999;
  const effectiveIncomeStartAge = client.gi_legacy_mode
    ? LEGACY_NO_INCOME_AGE
    : Math.max(client.income_start_age ?? 65, clientAge);
  const payoutType = client.payout_type ?? 'individual';
  const payoutOption = client.payout_option ?? 'level';
  const rollUpOption = client.roll_up_option ?? null;

  // --- Conversion timing ---
  const conversionYears = client.gi_conversion_years ?? 5;
  // NOTE: gi_conversion_bracket is no longer used to TAX conversions — as of v70
  // (F15) the conversion tax is computed progressively (marginal, SS-aware) like
  // the baseline RMD tax, not at a flat bracket rate. Conversion SIZING remains
  // the fixed-years schedule (balance / years), independent of any bracket.
  const conversionEndAge = clientAge + conversionYears - 1;
  const purchaseAge = conversionEndAge + 1;

  // Calculate deferral years (from purchase to income start)
  const deferralYears = Math.max(0, effectiveIncomeStartAge - purchaseAge);

  // --- Tax config ---
  const stateTaxRateDecimal = client.state_tax_rate !== undefined && client.state_tax_rate !== null
    ? client.state_tax_rate / 100
    : getStateTaxRate(client.state);
  // Conversion-tax funding source. 'from_ira' pays from the IRA (with gross-up).
  // We ALSO fall back to the IRA when the advisor chose 'from_taxable' but the
  // client has NO taxable account ($0): "pay from taxable" then has no funding
  // source, so the conversion tax was silently clamped to $0 (the taxableBalance
  // floor), making conversions look tax-free and the bracket irrelevant to
  // wealth (~160 clients — mostly the default from_taxable + $0 taxable). The
  // report shows a banner. Clients WITH a real taxable balance are unchanged.
  const payTaxFromIRA = client.tax_payment_source === 'from_ira'
    || (client.taxable_accounts ?? 0) <= 0;

  // --- SSI config ---
  const primarySsStartAge = client.ssi_payout_age ?? 67;
  const primarySsAmount = client.ssi_annual_amount ?? 0;
  const spouseSsStartAge = client.spouse_ssi_payout_age ?? 67;
  const spouseSsAmount = client.spouse_ssi_annual_amount ?? 0;
  // Only carry spouse data when the filer is actually married. Stops a stale
  // spouse_age from leaking into the year-by-year table after an advisor
  // switches a client back to single/HoH.
  const isMarriedFiler = client.filing_status === 'married_filing_jointly'
    || client.filing_status === 'married_filing_separately';
  const useSpouseAgeBased = isMarriedFiler
    && client.spouse_age !== undefined
    && client.spouse_age !== null
    && client.spouse_age > 0;
  const initialSpouseAge = useSpouseAgeBased ? client.spouse_age! : null;
  const ssiColaRate = 0.02;

  // --- Rider fee config ---
  const riderFeeRate = productData ? productData.riderFee / 100 : 0;
  const riderFeeAppliesTo = productData?.riderFeeAppliesTo ?? 'incomeBase';

  // --- Initial values ---
  let traditionalBalance = client.qualified_account_value ?? 0;
  let rothBalance = client.roth_ira ?? 0;
  let taxableBalance = client.taxable_accounts ?? 0;

  // For fixed-years conversion, calculate the base annual conversion amount
  // This ensures predictable conversion behavior: convert initial amount / years
  // The IRA grows between conversions, so we convert the fixed amount each year
  // (or remaining balance if less than fixed amount)
  const fixedAnnualConversion = Math.round(traditionalBalance / conversionYears);

  // --- Tracking ---
  const incomeHistory = new Map<number, number>();
  let totalConversionTax = 0;
  let totalRiderFees = 0;
  let cumulativeIncome = 0;

  // GI-specific tracking (populated after purchase)
  let accountValue = 0;
  let incomeBase = 0;
  let incomeBaseAtStart = 0;
  let incomeBaseAtIncomeAge = 0;
  let originalIncomeBase = 0;
  let guaranteedAnnualIncome = 0;
  let purchaseAmount = 0;
  let bonusAmount = 0;
  let bonusAppliesTo: string | null = null;
  let payoutPercent = 0;
  let giPurchased = false;
  const rollUpDescription = productData?.rollUpDescription ?? '';

  // Track lifetime income
  let totalGrossPaid = 0;
  let totalNetPaid = 0;

  for (let yearOffset = 0; yearOffset < projectionYears; yearOffset++) {
    const year = startYear + yearOffset;
    const age = useAgeBased ? getAgeAtYearOffset(clientAge, yearOffset) : 62 + yearOffset;
    const spouseAge = isMarriedFiler && client.spouse_dob ? calculateAge(client.spouse_dob, year) : null;

    // Beginning of Year balances
    const boyTraditional = traditionalBalance;
    const boyRoth = rothBalance;
    const boyTaxable = taxableBalance;
    const boyAccount = accountValue;

    // --- SSI income ---
    // SS is entered in TODAY'S dollars. COLA years = min(yearOffset, age - startAge):
    // a client already collecting at the projection start grows only from the start
    // (yearOffset) — anchoring to (age - startAge) would re-apply COLA already baked
    // into their current benefit and over-state it. A future collector still grows
    // from the claim age (age - startAge = 0 at claim), matching the entered amount.
    const primarySsIncome = age >= primarySsStartAge
      ? Math.round(primarySsAmount * Math.pow(1 + ssiColaRate, Math.min(yearOffset, age - primarySsStartAge)))
      : 0;

    let spouseSsIncome = 0;
    if (client.filing_status === 'married_filing_jointly' && spouseSsAmount > 0) {
      const currentSpouseAge = initialSpouseAge !== null ? initialSpouseAge + yearOffset : 0;
      spouseSsIncome = currentSpouseAge >= spouseSsStartAge
        ? Math.round(spouseSsAmount * Math.pow(1 + ssiColaRate, Math.min(yearOffset, currentSpouseAge - spouseSsStartAge)))
        : 0;
    }
    const ssIncome = primarySsIncome + spouseSsIncome;
    const otherIncome = getNonSSIIncomeForYear(client, year);
    const taxExemptNonSSI = getTaxExemptIncomeForYear(client, year);

    // --- Standard deduction ---
    const deductions = getEffectiveDeduction(client.filing_status, age, spouseAge ?? undefined, year, client.additional_deductions);

    // Determine current phase
    let currentPhase: 'conversion' | 'purchase' | 'deferral' | 'income';
    if (age <= conversionEndAge) {
      currentPhase = 'conversion';
    } else if (age === purchaseAge && !giPurchased) {
      currentPhase = 'purchase';
    } else if (age < effectiveIncomeStartAge) {
      currentPhase = 'deferral';
    } else {
      currentPhase = 'income';
    }

    // =======================================================================
    // PHASE 1: CONVERSION - Convert Traditional IRA to Roth
    // =======================================================================
    if (currentPhase === 'conversion') {
      let conversionAmount = 0;
      let federalConversionTax = 0;
      let stateConversionTax = 0;

      // Voluntary withdrawals (advisor-scheduled). For GI we apply them ONLY
      // during the conversion phase — once the funds are inside the GI annuity
      // (purchase + deferral + income phases) the engine doesn't model
      // ad-hoc withdrawals from the AV. This covers the most common case
      // (advisor pulling income before the GI starts).
      const wdGI = resolveWithdrawalsForYear(client, year, boyTraditional, boyRoth);
      const iraWithdrawalGI = wdGI.iraPulled;
      const rothWithdrawalGI = wdGI.rothPulled;

      // Forced RMD — kicks in at the SECURE-Act age (73/75). A client can be
      // mid-conversion at RMD age; the RMD is "first dollars out" and CANNOT be
      // converted (IRS rule), so it must be distributed and removed from the
      // convertible balance. A voluntary IRA pull already counts toward the RMD
      // up to its amount (so we only force the shortfall beyond it). Mirrors the
      // growth/formula engines + the GI baseline's own RMD handling.
      const rmdRequired = client.rmds_handled_externally
        ? 0
        : Math.min(calculateRMD({ age, traditionalBalance: boyTraditional, birthYear }).rmdAmount, boyTraditional);
      const forcedRmdShortfall = Math.max(0, rmdRequired - iraWithdrawalGI);
      const effectiveIraDistribution = iraWithdrawalGI + forcedRmdShortfall;

      // Subtract the RMD + voluntary distribution immediately so conversion math
      // sees the right balance (those dollars leave the IRA; they don't convert).
      const availableTraditional = boyTraditional - effectiveIraDistribution;
      const availableRoth = boyRoth - rothWithdrawalGI;

      // Check if this is the LAST year of conversion phase
      const isLastConversionYear = age === conversionEndAge;

      if (availableTraditional > 0) {
        // PROGRESSIVE conversion tax (F15, v70). The prior code taxed the
        // conversion at a FLAT `conversionBracket% + state%`. That is wrong in
        // both directions: a large conversion that blows past the assumed
        // bracket is UNDER-taxed, while a conversion that sits below it is
        // OVER-taxed — and because the tax is deducted from the balance (from
        // the IRA on gross-up, or from the taxable account otherwise), the wrong
        // rate corrupts the client's net worth. We now mirror the baseline GI's
        // own RMD tax method: the conversion's tax is its MARGINAL tax stacked on
        // top of the year's forced ordinary income (pension + voluntary IRA pull
        // + forced RMD) and SS, exactly `tax_with − tax_without`, SS-torpedo
        // aware. The RMD's own marginal tax is computed separately below on the
        // base WITHOUT the conversion, so the two telescope to the full
        // progressive tax on (forced income + conversion).
        const convMarginalTax = (distribution: number): { fed: number; state: number; total: number } => {
          if (distribution <= 0) return { fed: 0, state: 0, total: 0 };
          const forcedOrdinary = otherIncome + iraWithdrawalGI + forcedRmdShortfall;
          const withDist = computeTaxableIncomeWithSS({ otherIncome: forcedOrdinary + distribution, ssBenefits: ssIncome, taxExemptInterest: taxExemptNonSSI, deductions, filingStatus: client.filing_status, age, spouseAge: spouseAge ?? undefined, taxYear: year });
          const without = computeTaxableIncomeWithSS({ otherIncome: forcedOrdinary, ssBenefits: ssIncome, taxExemptInterest: taxExemptNonSSI, deductions, filingStatus: client.filing_status, age, spouseAge: spouseAge ?? undefined, taxYear: year });
          const fed = Math.max(0, calculateFederalTax({ taxableIncome: withDist.taxableIncome, filingStatus: client.filing_status, taxYear: year }).totalTax - calculateFederalTax({ taxableIncome: without.taxableIncome, filingStatus: client.filing_status, taxYear: year }).totalTax);
          const state = Math.max(0, calculateStateTax({ taxableIncome: withDist.taxableIncome, state: client.state, filingStatus: client.filing_status, overrideRate: stateTaxRateDecimal }).totalTax - calculateStateTax({ taxableIncome: without.taxableIncome, state: client.state, filingStatus: client.filing_status, overrideRate: stateTaxRateDecimal }).totalTax);
          return { fed, state, total: fed + state };
        };

        // Target conversion (sizing unchanged: fixed-years schedule; last year
        // empties the IRA so everything lands in the Roth GI).
        const targetConv = isLastConversionYear
          ? availableTraditional
          : Math.min(fixedAnnualConversion, availableTraditional);

        if (payTaxFromIRA) {
          // The tax is withheld from the IRA, so the conversion AND its tax both
          // leave the IRA as ONE taxable distribution D = conversion + tax(D)
          // (gross-up). With a progressive tax there's no closed form, so solve
          // the self-consistent D by iteration — tax slope < 1 makes the map a
          // contraction, so it converges in a few steps. Cap D at the available
          // balance (can't distribute more than is there).
          let dist: number;
          if (isLastConversionYear) {
            dist = availableTraditional; // empty the IRA: distribute everything
          } else {
            dist = targetConv;
            for (let i = 0; i < 8; i++) {
              dist = Math.min(availableTraditional, targetConv + convMarginalTax(dist).total);
            }
          }
          const t = convMarginalTax(dist);
          federalConversionTax = t.fed;
          stateConversionTax = t.state;
          conversionAmount = Math.max(0, dist - t.total);
        } else {
          // Tax paid from the taxable account: convert the full target; the tax
          // is the progressive marginal tax on the conversion alone.
          conversionAmount = targetConv;
          const t = convMarginalTax(conversionAmount);
          federalConversionTax = t.fed;
          stateConversionTax = t.state;
        }
      }

      const conversionTax = federalConversionTax + stateConversionTax;
      totalConversionTax += conversionTax;

      // Marginal tax on the forced RMD (ordinary income on top of other income +
      // any voluntary IRA pull + SS), mirroring the GI baseline's RMD tax so the
      // two sides compare fairly. The RMD is taxable even though it isn't a
      // conversion. (The conversion's own tax is the flat-rate figure above.)
      let rmdFederalTax = 0;
      let rmdStateTax = 0;
      if (forcedRmdShortfall > 0) {
        const withRMD = computeTaxableIncomeWithSS({ otherIncome: otherIncome + iraWithdrawalGI + forcedRmdShortfall, ssBenefits: ssIncome, taxExemptInterest: taxExemptNonSSI, deductions, filingStatus: client.filing_status, age, spouseAge: spouseAge ?? undefined, taxYear: year });
        const withoutRMD = computeTaxableIncomeWithSS({ otherIncome: otherIncome + iraWithdrawalGI, ssBenefits: ssIncome, taxExemptInterest: taxExemptNonSSI, deductions, filingStatus: client.filing_status, age, spouseAge: spouseAge ?? undefined, taxYear: year });
        rmdFederalTax = Math.max(0, calculateFederalTax({ taxableIncome: withRMD.taxableIncome, filingStatus: client.filing_status, taxYear: year }).totalTax - calculateFederalTax({ taxableIncome: withoutRMD.taxableIncome, filingStatus: client.filing_status, taxYear: year }).totalTax);
        rmdStateTax = Math.max(0, calculateStateTax({ taxableIncome: withRMD.taxableIncome, state: client.state, filingStatus: client.filing_status, overrideRate: stateTaxRateDecimal }).totalTax - calculateStateTax({ taxableIncome: withoutRMD.taxableIncome, state: client.state, filingStatus: client.filing_status, overrideRate: stateTaxRateDecimal }).totalTax);
      }
      const afterTaxForcedRmd = forcedRmdShortfall - rmdFederalTax - rmdStateTax;

      // RMD-funds-conversion-tax (v64): when the conversion tax is paid from the
      // IRA in an RMD year, it's withheld from the after-tax RMD first; only the
      // shortfall is pulled as an EXTRA distribution beyond the RMD. The RMD has
      // already left the IRA (effectiveIraDistribution), so the funded portion
      // must NOT re-deplete the IRA or be re-recognized as income.
      const conversionTaxFromIRA = payTaxFromIRA ? conversionTax : 0;
      const conversionTaxFundedFromRmd = Math.min(conversionTaxFromIRA, Math.max(0, afterTaxForcedRmd));
      const extraPullForTax = conversionTaxFromIRA - conversionTaxFundedFromRmd;

      // Execute conversion. The RMD + voluntary distribution were already netted
      // out of availableTraditional above; only the conversion and the EXTRA tax
      // pull (beyond the RMD) come off the IRA here.
      traditionalBalance = availableTraditional - conversionAmount - extraPullForTax;
      rothBalance = availableRoth + conversionAmount;

      // Apply growth
      const traditionalInterest = Math.round(traditionalBalance * rateOfReturn);
      const rothInterest = Math.round(rothBalance * rateOfReturn);
      const taxableInterest = Math.round(boyTaxable * rateOfReturn);

      traditionalBalance += traditionalInterest;
      rothBalance += rothInterest;

      // Gross taxable income for the year. When the IRA funds its own taxes,
      // the tax withheld is ALSO a taxable distribution on the 1099-R, so it
      // must be added to the income base — otherwise the year's MAGI/IRMAA
      // lookback and the reported taxable income both understate reality.
      // Voluntary IRA pulls + the forced RMD (effectiveIraDistribution) join the
      // same ordinary-income bucket; voluntary Roth pulls are tax-free/excluded.
      // Only the EXTRA tax pull beyond the RMD adds incremental income — the
      // conversion tax withheld from the RMD is already inside the RMD.
      const grossIncomeWithConversion = otherIncome + conversionAmount + extraPullForTax + effectiveIraDistribution;
      const magi = grossIncomeWithConversion + taxExemptNonSSI + ssIncome;
      incomeHistory.set(year, magi);

      // IRMAA surcharge + tier both come from the same 2-year-lookback MAGI
      // so the displayed tier matches the dollar surcharge on the same row.
      // See baseline.ts for the longer rationale.
      let irmaaSurcharge = 0;
      let irmaaTierFromLookback = 0;
      if (age >= 65) {
        const irmaaResult = calculateIRMAAWithLookback(year, incomeHistory, client.filing_status);
        irmaaSurcharge = irmaaResult.annualSurcharge;
        irmaaTierFromLookback = irmaaResult.tier;
      }

      // 10% early withdrawal penalty applies to (a) IRA-funded conversion tax
      // when under 59.5 and (b) any voluntary IRA pull this year when under
      // 59.5. Conversions themselves are penalty-exempt.
      // Penalty applies to the EXTRA pull beyond the RMD (RMDs are 73+, never
      // under 59.5, so extraPullForTax == conversionTaxFromIRA when age < 60).
      const conversionTaxPenalty =
        extraPullForTax > 0 && age < 60
          ? Math.round(extraPullForTax * 0.10)
          : 0;
      const voluntaryWithdrawalPenalty = earlyWithdrawalPenaltyOnIRA(age, iraWithdrawalGI);
      const earlyWithdrawalPenalty = conversionTaxPenalty + voluntaryWithdrawalPenalty;

      const totalTax = conversionTax + rmdFederalTax + rmdStateTax + irmaaSurcharge + earlyWithdrawalPenalty;

      // Handle the taxable account. Inflow: the after-tax forced RMD, reduced by
      // the conversion tax withheld from it (those dollars went to the IRS, not
      // the brokerage — so they aren't double-counted), kept only in
      // reinvested/cash treatment ('spent' consumes it). The RMD's own tax is
      // already netted out (afterTaxForcedRmd). Outflow: conversion tax only when
      // paid externally, plus IRMAA + early-withdrawal penalty (always external).
      // Clamp at $0 (Jorge V., ticket 809a5774) — residual tax with no portfolio
      // left is assumed paid from external income, not driven negative.
      const rmdTreatment = client.rmd_treatment ?? 'reinvested';
      const afterTaxRmdToTaxable = rmdTreatment === 'spent'
        ? 0
        : Math.max(0, afterTaxForcedRmd - conversionTaxFundedFromRmd);
      const externalConversionTax = payTaxFromIRA ? 0 : conversionTax;
      const desiredTaxable = boyTaxable + taxableInterest + afterTaxRmdToTaxable
        - externalConversionTax - irmaaSurcharge - earlyWithdrawalPenalty;
      taxableBalance = Math.max(0, desiredTaxable);

      // Calculate tax details with SS taxation awareness.
      const convPhaseTaxInfo = computeTaxableIncomeWithSS({
        otherIncome: grossIncomeWithConversion,
        ssBenefits: ssIncome,
        taxExemptInterest: taxExemptNonSSI,
        deductions,
        filingStatus: client.filing_status,
        age,
        spouseAge: spouseAge ?? undefined,
        taxYear: year,
      });
      const totalIncome = grossIncomeWithConversion + ssIncome;
      const agi = convPhaseTaxInfo.agi;
      const taxableIncome = convPhaseTaxInfo.taxableIncome;
      const federalTaxBracket = getMarginalBracket(taxableIncome, client.filing_status, year);
      const irmaaTier = irmaaTierFromLookback;

      // Account growth this year
      const traditionalGrowth = traditionalInterest;
      const rothGrowth = rothInterest;
      const taxableGrowth = taxableInterest;

      results.push({
        year, age, spouseAge,
        traditionalBalance,
        rothBalance,
        taxableBalance,
        rmdAmount: rmdRequired,
        conversionAmount,
        ssIncome,
        pensionIncome: 0,
        otherIncome,
        totalIncome,
        federalTax: federalConversionTax + rmdFederalTax,
        stateTax: stateConversionTax + rmdStateTax,
        niitTax: 0,
        irmaaSurcharge,
        totalTax,
        taxableSS: convPhaseTaxInfo.taxableSS,
        netWorth: traditionalBalance + rothBalance + taxableBalance,
        // Extended fields for adjustable columns
        traditionalBOY: boyTraditional,
        rothBOY: boyRoth,
        taxableBOY: boyTaxable,
        traditionalGrowth,
        rothGrowth,
        taxableGrowth,
        productBonusApplied: 0, // No bonus during conversion
        magi,
        agi,
        standardDeduction: deductions,
        taxableIncome,
        federalTaxBracket,
        irmaaTier,
        federalTaxOnSS: 0,
        federalTaxOnConversions: federalConversionTax,
        federalTaxOnOrdinaryIncome: rmdFederalTax,
        stateTaxOnSS: 0,
        stateTaxOnConversions: stateConversionTax,
        stateTaxOnOrdinaryIncome: rmdStateTax,
        totalIRAWithdrawal: conversionAmount + extraPullForTax + effectiveIraDistribution,
        taxesPaidFromIRA: conversionTaxFromIRA,
        earlyWithdrawalPenalty,
        iraWithdrawal: iraWithdrawalGI,
        rothWithdrawal: rothWithdrawalGI,
        // GI-specific fields
        incomeRiderValue: 0,
        accumulationValue: 0,
        incomePayoutAmount: 0,
        riderFee: 0,
        giPhase: 'conversion',
        giIncomeNet: 0,
        giCumulativeIncome: 0,
        giRollUpGrowth: 0,
        giPayoutRate: 0,
        giConversionTax: conversionTax,
      });

      giYearlyData.push({
        year, age,
        phase: 'conversion',
        traditionalBalance,
        rothBalance,
        conversionAmount,
        conversionTax,
        accountValue: 0,
        incomeBase: 0,
        guaranteedIncomeGross: 0,
        guaranteedIncomeNet: 0,
        riderFee: 0,
        cumulativeIncome: 0,
      });
    }

    // =======================================================================
    // PHASE 2: PURCHASE - Buy GI FIA inside Roth
    // =======================================================================
    else if (currentPhase === 'purchase') {
      // Use entire Roth balance to purchase GI FIA
      purchaseAmount = rothBalance;

      // Apply product-specific bonus logic
      if (productData) {
        bonusAppliesTo = productData.bonusAppliesTo;
        const bonusRate = (client.bonus_percent ?? 0) / 100;

        if (productData.bonusAppliesTo === 'both' || productData.bonusAppliesTo === 'accountValue') {
          // Simple Roll-up Income: bonus goes to BOTH account value AND income base
          accountValue = Math.round(purchaseAmount * (1 + bonusRate));
          incomeBase = Math.round(purchaseAmount * (1 + bonusRate));
          bonusAmount = Math.round(purchaseAmount * bonusRate);
        } else if (productData.bonusAppliesTo === 'incomeBase') {
          // Compound Roll-up Income: bonus goes to income base only
          accountValue = purchaseAmount;
          incomeBase = Math.round(purchaseAmount * (1 + bonusRate));
          bonusAmount = Math.round(purchaseAmount * bonusRate);
        } else {
          // Flat-Rate Compound Income: no bonus
          accountValue = purchaseAmount;
          incomeBase = purchaseAmount;
        }
      } else {
        // Fallback
        const bonusRate = (client.bonus_percent ?? 0) / 100;
        accountValue = Math.round(purchaseAmount * (1 + bonusRate));
        incomeBase = accountValue;
        bonusAmount = Math.round(purchaseAmount * bonusRate);
      }

      incomeBaseAtStart = incomeBase;
      originalIncomeBase = incomeBase;

      // Apply FIRST year of roll-up during purchase phase
      // This ensures we get the full deferral period of roll-ups
      // (e.g., 10 years from age 60 to 70 = 10 roll-ups, not 9)
      const incomeBasePrePurchaseRollUp = incomeBase;
      if (productData) {
        const rollUpInfo = getEffectiveRollUpForYear(productId, 1, rollUpOption, customProduct, rateOfReturn); // Year 1 roll-up
        if (rollUpInfo) {
          if (rollUpInfo.creditBasis === 'account_value') {
            // Pattern B (Athene Agility): credit the multiple of the DOLLARS
            // credited to the account value. rollUpInfo.rate is already
            // multiple × creditedRate, and accountValue is the year's beginning
            // AV, so rate × accountValue = multiple × (creditedRate × AV).
            incomeBase = incomeBase + Math.round(rollUpInfo.rate * accountValue);
          } else if (rollUpInfo.type === 'simple') {
            incomeBase = incomeBase + Math.round(originalIncomeBase * rollUpInfo.rate);
          } else {
            incomeBase = Math.round(incomeBase * (1 + rollUpInfo.rate));
          }
        }
      }
      const purchaseRollUpGrowth = incomeBase - incomeBasePrePurchaseRollUp;

      // Roth balance is now 0 (money moved into GI)
      rothBalance = 0;
      giPurchased = true;

      // No tax event on purchase (inside Roth)
      const taxableInterest = Math.round(boyTaxable * rateOfReturn);
      taxableBalance = boyTaxable + taxableInterest;

      // IRMAA tracking
      const magi = otherIncome + taxExemptNonSSI + ssIncome;
      incomeHistory.set(year, magi);

      // IRMAA surcharge + tier both come from the same 2-year-lookback MAGI
      // so the displayed tier matches the dollar surcharge on the same row.
      // See baseline.ts for the longer rationale.
      let irmaaSurcharge = 0;
      let irmaaTierFromLookback = 0;
      if (age >= 65) {
        const irmaaResult = calculateIRMAAWithLookback(year, incomeHistory, client.filing_status);
        irmaaSurcharge = irmaaResult.annualSurcharge;
        irmaaTierFromLookback = irmaaResult.tier;
      }

      // Calculate tax details (with SS taxation awareness for display)
      const purchaseTaxInfo = computeTaxableIncomeWithSS({
        otherIncome,
        ssBenefits: ssIncome,
        taxExemptInterest: taxExemptNonSSI,
        deductions,
        filingStatus: client.filing_status,
        age,
        spouseAge: spouseAge ?? undefined,
        taxYear: year,
      });
      const totalIncome = otherIncome + ssIncome;
      const agi = purchaseTaxInfo.agi;
      const taxableIncome = purchaseTaxInfo.taxableIncome;
      const federalTaxBracket = getMarginalBracket(taxableIncome, client.filing_status, year);
      const irmaaTier = irmaaTierFromLookback;

      // Account growth this year
      const traditionalGrowth = 0; // No growth (purchased this year, balance moved to GI)
      const rothGrowth = 0; // Roth converted everything
      const taxableGrowth = taxableInterest;

      // Product bonus applied on purchase
      const productBonusApplied = bonusAmount;

      results.push({
        year, age, spouseAge,
        traditionalBalance: accountValue, // Map GI account value to traditional for chart compatibility
        rothBalance: 0,
        taxableBalance,
        rmdAmount: 0,
        conversionAmount: 0,
        ssIncome,
        pensionIncome: 0,
        otherIncome,
        totalIncome,
        federalTax: 0,
        stateTax: 0,
        niitTax: 0,
        irmaaSurcharge,
        totalTax: irmaaSurcharge,
        taxableSS: purchaseTaxInfo.taxableSS,
        netWorth: accountValue + taxableBalance,
        // Extended fields for adjustable columns
        traditionalBOY: 0, // Purchased this year, was zero at BOY
        rothBOY: boyRoth,
        taxableBOY: boyTaxable,
        traditionalGrowth,
        rothGrowth,
        taxableGrowth,
        productBonusApplied,
        magi,
        agi,
        standardDeduction: deductions,
        taxableIncome,
        federalTaxBracket,
        irmaaTier,
        federalTaxOnSS: 0,
        federalTaxOnConversions: 0,
        federalTaxOnOrdinaryIncome: 0,
        stateTaxOnSS: 0,
        stateTaxOnConversions: 0,
        stateTaxOnOrdinaryIncome: 0,
        // GI-specific fields
        incomeRiderValue: incomeBase,
        accumulationValue: accountValue,
        incomePayoutAmount: 0,
        riderFee: 0,
        giPhase: 'purchase',
        giIncomeNet: 0,
        giCumulativeIncome: 0,
        giRollUpGrowth: purchaseRollUpGrowth,
        giPayoutRate: 0,
        giConversionTax: 0,
      });

      giYearlyData.push({
        year, age,
        phase: 'purchase',
        traditionalBalance: 0,
        rothBalance: 0,
        conversionAmount: 0,
        conversionTax: 0,
        accountValue,
        incomeBase,
        guaranteedIncomeGross: 0,
        guaranteedIncomeNet: 0,
        riderFee: 0,
        cumulativeIncome: 0,
      });
    }

    // =======================================================================
    // PHASE 3: DEFERRAL - Income Base grows via roll-up
    // =======================================================================
    else if (currentPhase === 'deferral') {
      const deferralYear = age - purchaseAge + 1; // 1-indexed for roll-up tier lookup

      // Roll up Income Base using product-specific config
      const incomeBasePreRollUp = incomeBase;
      if (productData) {
        const rollUpInfo = getEffectiveRollUpForYear(productId, deferralYear, rollUpOption, customProduct, rateOfReturn);
        if (rollUpInfo) {
          if (rollUpInfo.creditBasis === 'account_value') {
            // Pattern B (Athene Agility): grow the base by the multiple of the
            // DOLLARS credited to the account value this year. accountValue here
            // is the beginning-of-year AV (it grows just below), matching the
            // carrier's "200% of the dollar amount credited to the Accumulated
            // Value". rollUpInfo.rate = multiple × creditedRate.
            incomeBase = incomeBase + Math.round(rollUpInfo.rate * accountValue);
          } else if (rollUpInfo.type === 'simple') {
            incomeBase = incomeBase + Math.round(originalIncomeBase * rollUpInfo.rate);
          } else {
            incomeBase = Math.round(incomeBase * (1 + rollUpInfo.rate));
          }
        }
      } else {
        const guaranteedRateOfReturn = (client.guaranteed_rate_of_return ?? 7) / 100;
        incomeBase = Math.round(incomeBase * (1 + guaranteedRateOfReturn));
      }
      const deferralRollUpGrowth = incomeBase - incomeBasePreRollUp;

      // Account value grows
      const accountInterest = Math.round(accountValue * rateOfReturn);
      accountValue = accountValue + accountInterest;

      // Deduct rider fee
      let yearRiderFee = 0;
      if (riderFeeRate > 0) {
        const feeBase = riderFeeAppliesTo === 'accountValue' ? accountValue : incomeBase;
        yearRiderFee = Math.round(feeBase * riderFeeRate);
        accountValue = Math.max(0, accountValue - yearRiderFee);
        totalRiderFees += yearRiderFee;
      }

      // If this is the last deferral year, lock in income base and payout
      if (age + 1 === effectiveIncomeStartAge) {
        incomeBaseAtIncomeAge = incomeBase;
        const payoutFactor = productData
          ? getEffectivePayoutFactor(productId, payoutType, effectiveIncomeStartAge, payoutOption, customProduct)
          : 0.05;
        payoutPercent = payoutFactor * 100;
        guaranteedAnnualIncome = Math.round(incomeBaseAtIncomeAge * payoutFactor);
      }

      // Taxable account grows
      const taxableInterest = Math.round(boyTaxable * rateOfReturn);
      taxableBalance = boyTaxable + taxableInterest;

      // IRMAA
      const magi = otherIncome + taxExemptNonSSI + ssIncome;
      incomeHistory.set(year, magi);

      // IRMAA surcharge + tier both come from the same 2-year-lookback MAGI
      // so the displayed tier matches the dollar surcharge on the same row.
      // See baseline.ts for the longer rationale.
      let irmaaSurcharge = 0;
      let irmaaTierFromLookback = 0;
      if (age >= 65) {
        const irmaaResult = calculateIRMAAWithLookback(year, incomeHistory, client.filing_status);
        irmaaSurcharge = irmaaResult.annualSurcharge;
        irmaaTierFromLookback = irmaaResult.tier;
      }

      // Calculate tax details (with SS taxation awareness)
      const strategyDeferralTaxInfo = computeTaxableIncomeWithSS({
        otherIncome,
        ssBenefits: ssIncome,
        taxExemptInterest: taxExemptNonSSI,
        deductions,
        filingStatus: client.filing_status,
        age,
        spouseAge: spouseAge ?? undefined,
        taxYear: year,
      });
      const totalIncome = otherIncome + ssIncome;
      const agi = strategyDeferralTaxInfo.agi;
      const taxableIncome = strategyDeferralTaxInfo.taxableIncome;
      const federalTaxBracket = getMarginalBracket(taxableIncome, client.filing_status, year);
      const irmaaTier = irmaaTierFromLookback;

      // Account growth this year (interest before rider fee)
      const traditionalGrowth = accountInterest;
      const rothGrowth = 0;
      const taxableGrowth = taxableInterest;

      results.push({
        year, age, spouseAge,
        traditionalBalance: accountValue,
        rothBalance: 0,
        taxableBalance,
        rmdAmount: 0,
        conversionAmount: 0,
        ssIncome,
        pensionIncome: 0,
        otherIncome,
        totalIncome,
        federalTax: 0,
        stateTax: 0,
        niitTax: 0,
        irmaaSurcharge,
        totalTax: irmaaSurcharge,
        taxableSS: strategyDeferralTaxInfo.taxableSS,
        netWorth: accountValue + taxableBalance,
        // Extended fields for adjustable columns
        traditionalBOY: boyAccount,
        rothBOY: 0,
        taxableBOY: boyTaxable,
        traditionalGrowth,
        rothGrowth,
        taxableGrowth,
        productBonusApplied: 0, // No bonus during deferral
        magi,
        agi,
        standardDeduction: deductions,
        taxableIncome,
        federalTaxBracket,
        irmaaTier,
        federalTaxOnSS: 0,
        federalTaxOnConversions: 0,
        federalTaxOnOrdinaryIncome: 0,
        stateTaxOnSS: 0,
        stateTaxOnConversions: 0,
        stateTaxOnOrdinaryIncome: 0,
        // GI-specific fields
        incomeRiderValue: incomeBase,
        accumulationValue: accountValue,
        incomePayoutAmount: 0,
        riderFee: yearRiderFee,
        giPhase: 'deferral',
        giIncomeNet: 0,
        giCumulativeIncome: 0,
        giRollUpGrowth: deferralRollUpGrowth,
        giPayoutRate: 0,
        giConversionTax: 0,
      });

      giYearlyData.push({
        year, age,
        phase: 'deferral',
        traditionalBalance: 0,
        rothBalance: 0,
        conversionAmount: 0,
        conversionTax: 0,
        accountValue,
        incomeBase,
        guaranteedIncomeGross: 0,
        guaranteedIncomeNet: 0,
        riderFee: yearRiderFee,
        cumulativeIncome: 0,
      });
    }

    // =======================================================================
    // PHASE 4: INCOME - Tax-free guaranteed income for life
    // =======================================================================
    else {
      // On first income year, lock in if not already done
      if (guaranteedAnnualIncome === 0) {
        incomeBaseAtIncomeAge = incomeBase;
        const payoutFactor = productData
          ? getEffectivePayoutFactor(productId, payoutType, effectiveIncomeStartAge, payoutOption, customProduct)
          : 0.05;
        payoutPercent = payoutFactor * 100;
        guaranteedAnnualIncome = Math.round(incomeBaseAtIncomeAge * payoutFactor);
      }

      // For "increasing" LPA option, apply annual increase after first year.
      // Rate depends on the product's increasing_income_basis: 'credited_rate'
      // ties the step-up to the assumed crediting rate (rateOfReturn, 0% floor)
      // — Allianz 222 / Agility; 'fixed' uses the preset's flat ~2% (default).
      const yearsOfIncome = age - effectiveIncomeStartAge;
      let grossGI = guaranteedAnnualIncome;
      if (payoutOption === 'increasing' && yearsOfIncome > 0) {
        const increaseRate = getEffectiveIncreasingIncomeRate(productId, customProduct, rateOfReturn);
        if (increaseRate > 0) {
          grossGI = Math.round(guaranteedAnnualIncome * Math.pow(1 + increaseRate, yearsOfIncome));
        }
      }

      // TAX-FREE because it's inside a Roth IRA!
      const netGI = grossGI; // No tax on Roth distributions

      totalGrossPaid += grossGI;
      totalNetPaid += netGI;
      cumulativeIncome += netGI;

      // Pro-rata benefit-base draw-down (Allianz 222 / Athene Agility): the
      // benefit base (= enhanced death benefit) reduces by the SAME proportion
      // the income withdrawal reduces the account value. Opt-in per product —
      // classic GLWBs keep the income base LOCKED during guaranteed income and
      // only reduce it on excess withdrawals (benefitBaseDrawsDown = false).
      // Verified to the dollar vs the Agility/222 illustrations
      // (yr1 income: $465,000 × (1 − 23,250/300,000) = $428,963).
      if (productData?.benefitBaseDrawsDown && boyAccount > 0) {
        const withdrawalFraction = Math.min(1, grossGI / boyAccount);
        // Draw down `incomeBase` (the death-benefit value during income), NOT
        // incomeBaseAtIncomeAge — the latter is the LOCKED income-base metric
        // and must stay fixed (it sizes the income + is reported as "income base
        // at income age"). At the income lock they're equal; here they diverge.
        incomeBase = Math.round(incomeBase * (1 - withdrawalFraction));
      }

      // Deduct GI payment from account value
      accountValue = boyAccount - grossGI;

      // Account value floors at $0, but income keeps paying
      if (accountValue < 0) {
        accountValue = 0;
      }

      // Interest on remaining account value
      const accountInterest = Math.round(accountValue * rateOfReturn);
      accountValue = accountValue + accountInterest;

      // Deduct rider fee during income phase too
      let yearRiderFee = 0;
      if (riderFeeRate > 0 && accountValue > 0) {
        const feeBase = riderFeeAppliesTo === 'accountValue' ? accountValue : incomeBase;
        yearRiderFee = Math.round(feeBase * riderFeeRate);
        accountValue = Math.max(0, accountValue - yearRiderFee);
        totalRiderFees += yearRiderFee;
      }

      // Taxable account: the Roth GI itself is tax-free, but the client's pension
      // (otherIncome) + taxable SS still generate a real tax bill. The final
      // balance is set below, once that tax is computed (F16) — the prior code
      // banked grossGI with NO tax deducted AND reported federalTax:0, which
      // understated the strategy's tax and inflated the tax-savings headline.
      const taxableInterest = Math.round(boyTaxable * rateOfReturn);

      // IRMAA (GI from Roth doesn't count toward MAGI)
      const magi = otherIncome + taxExemptNonSSI + ssIncome;
      incomeHistory.set(year, magi);

      // IRMAA surcharge + tier both come from the same 2-year-lookback MAGI
      // so the displayed tier matches the dollar surcharge on the same row.
      // See baseline.ts for the longer rationale.
      let irmaaSurcharge = 0;
      let irmaaTierFromLookback = 0;
      if (age >= 65) {
        const irmaaResult = calculateIRMAAWithLookback(year, incomeHistory, client.filing_status);
        irmaaSurcharge = irmaaResult.annualSurcharge;
        irmaaTierFromLookback = irmaaResult.tier;
      }

      // Calculate tax details. GI income itself is tax-free (Roth), but any
      // otherIncome the client has can still trigger SS taxation.
      const strategyIncomeTaxInfo = computeTaxableIncomeWithSS({
        otherIncome,
        ssBenefits: ssIncome,
        taxExemptInterest: taxExemptNonSSI,
        deductions,
        filingStatus: client.filing_status,
        age,
        spouseAge: spouseAge ?? undefined,
        taxYear: year,
      });
      const totalIncome = grossGI + otherIncome + ssIncome;
      const agi = strategyIncomeTaxInfo.agi;
      const taxableIncome = strategyIncomeTaxInfo.taxableIncome;
      const federalTaxBracket = getMarginalBracket(taxableIncome, client.filing_status, year);
      const irmaaTier = irmaaTierFromLookback;

      // Real federal/state tax on the strategy's TAXABLE income — the pension +
      // the taxable portion of SS (F16). The Roth GI is excluded from the base
      // above, so this is strictly the background-income tax. It's lower than the
      // baseline's (which also taxes the GI and pushes more SS into the torpedo),
      // and that gap is the genuine Roth advantage. Computed as TOTAL tax to
      // mirror the baseline income phase (calculateFederalTax on full taxable).
      const strategyIncomeFederalTax = calculateFederalTax({ taxableIncome, filingStatus: client.filing_status, taxYear: year }).totalTax;
      const strategyIncomeStateTax = calculateStateTax({ taxableIncome, state: client.state, filingStatus: client.filing_status, overrideRate: stateTaxRateDecimal }).totalTax;
      const strategyIncomeTotalTax = strategyIncomeFederalTax + strategyIncomeStateTax + irmaaSurcharge;
      // Split fed/state between taxable-SS and ordinary (pension), mirroring the
      // baseline income phase, for the per-column tax fields.
      const strategySsPart = strategyIncomeTaxInfo.taxableSS;
      const strategyOrdPart = otherIncome;
      const strategyDenom = strategySsPart + strategyOrdPart;
      const strategyFedTaxOnSS = strategyDenom > 0 && strategySsPart > 0 ? Math.round(strategyIncomeFederalTax * strategySsPart / strategyDenom) : 0;
      const strategyStateTaxOnSS = strategyDenom > 0 && strategySsPart > 0 ? Math.round(strategyIncomeStateTax * strategySsPart / strategyDenom) : 0;
      // Bank the tax-free GI, then net out the pension/SS tax (mirrors baseline).
      taxableBalance = boyTaxable + grossGI + taxableInterest - strategyIncomeTotalTax;

      // Account growth this year (interest after payout, before rider fee)
      const traditionalGrowth = accountInterest;
      const rothGrowth = 0;
      const taxableGrowth = taxableInterest;

      results.push({
        year, age, spouseAge,
        traditionalBalance: accountValue,
        rothBalance: 0,
        taxableBalance,
        rmdAmount: grossGI, // Map to RMD for chart compatibility
        conversionAmount: 0,
        ssIncome,
        pensionIncome: 0,
        otherIncome,
        totalIncome,
        federalTax: strategyIncomeFederalTax, // GI is tax-free Roth; this taxes pension + taxable SS (F16)
        stateTax: strategyIncomeStateTax,
        niitTax: 0,
        irmaaSurcharge,
        totalTax: strategyIncomeTotalTax,
        taxableSS: strategyIncomeTaxInfo.taxableSS,
        netWorth: accountValue + taxableBalance,
        // Extended fields for adjustable columns
        traditionalBOY: boyAccount,
        rothBOY: 0,
        taxableBOY: boyTaxable,
        traditionalGrowth,
        rothGrowth,
        taxableGrowth,
        productBonusApplied: 0, // No bonus during income phase
        magi,
        agi,
        standardDeduction: deductions,
        taxableIncome,
        federalTaxBracket,
        irmaaTier,
        federalTaxOnSS: strategyFedTaxOnSS,
        federalTaxOnConversions: 0,
        federalTaxOnOrdinaryIncome: strategyIncomeFederalTax - strategyFedTaxOnSS, // pension; GI itself is tax-free Roth
        stateTaxOnSS: strategyStateTaxOnSS,
        stateTaxOnConversions: 0,
        stateTaxOnOrdinaryIncome: strategyIncomeStateTax - strategyStateTaxOnSS,
        // GI-specific fields
        incomeRiderValue: incomeBase,
        accumulationValue: accountValue,
        incomePayoutAmount: grossGI,
        riderFee: yearRiderFee,
        giPhase: 'income',
        giIncomeNet: netGI,
        giCumulativeIncome: cumulativeIncome,
        giRollUpGrowth: 0,
        giPayoutRate: payoutPercent,
        giConversionTax: 0,
      });

      giYearlyData.push({
        year, age,
        phase: 'income',
        traditionalBalance: 0,
        rothBalance: 0,
        conversionAmount: 0,
        conversionTax: 0,
        accountValue,
        incomeBase: incomeBase,
        guaranteedIncomeGross: grossGI,
        guaranteedIncomeNet: netGI,
        riderFee: yearRiderFee,
        cumulativeIncome,
      });
    }
  }

  const strategyMetrics = {
    annualIncomeGross: guaranteedAnnualIncome,
    annualIncomeNet: guaranteedAnnualIncome, // Same as gross - TAX-FREE!
    lifetimeIncomeGross: totalGrossPaid,
    lifetimeIncomeNet: totalNetPaid,
    totalConversionTax,
    incomeStartAge: effectiveIncomeStartAge,
    incomeBaseAtIncomeAge,
    purchaseAge,
    purchaseAmount,
    conversionPhaseYears: conversionYears,
    deferralYears,
    incomeBaseAtStart,
    totalRiderFees,
    payoutPercent,
    rollUpDescription,
    bonusAmount,
    bonusAppliesTo,
  };

  // Tax-credit carryforward pool — post-pass over the GI strategy years. Offsets
  // the federal conversion tax dollar-for-dollar and retains the savings as cash;
  // no-op when the client has no credit.
  applyTaxCreditCarryforward(results, client.tax_credits);

  return { formula: results, strategyMetrics, strategyGIYearlyData: giYearlyData };
}

// ---------------------------------------------------------------------------
// BASELINE SCENARIO: Traditional GI (taxable income)
// ---------------------------------------------------------------------------

function runGIBaselineScenario(
  client: Client,
  startYear: number,
  projectionYears: number,
  strategyMetrics: GIStrategyMetrics & {
    incomeBaseAtStart: number;
    payoutPercent: number;
    rollUpDescription: string;
    bonusAmount: number;
    bonusAppliesTo: string | null;
  },
  customProduct?: CustomProductRow | null
): {
  baseline: YearlyResult[];
  baselineMetrics: GIBaselineMetrics;
  baselineGIYearlyData: GIYearData[];
} {
  const results: YearlyResult[] = [];
  const giYearlyData: GIYearData[] = [];

  // --- Product config (custom product overrides system preset via resolver) ---
  const productId = client.blueprint_type as GuaranteedIncomeFormulaType;
  const productData: GIProductData | undefined = getEffectiveGIData(productId, customProduct);

  // --- Age setup ---
  const useAgeBased = client.age !== undefined && client.age > 0;
  const clientAge = useAgeBased ? client.age : 62;

  // --- Rates ---
  const rateOfReturn = (client.rate_of_return ?? 7) / 100;

  // --- GI timing (same as strategy for fair comparison) ---
  // Legacy mode: income never starts here either (mirrors the strategy), so the
  // traditional-GI baseline also just holds and rolls up its benefit base.
  const effectiveIncomeStartAge = client.gi_legacy_mode ? 999 : strategyMetrics.incomeStartAge;
  const payoutType = client.payout_type ?? 'individual';
  const payoutOption = client.payout_option ?? 'level';
  const rollUpOption = client.roll_up_option ?? null;

  // Baseline: Purchase GI at SAME AGE as strategy for fair comparison
  // Both scenarios should have the same deferral period
  const purchaseAge = strategyMetrics.purchaseAge;
  const deferralYears = Math.max(0, effectiveIncomeStartAge - purchaseAge);

  // --- Tax config ---
  const stateTaxRateDecimal = client.state_tax_rate !== undefined && client.state_tax_rate !== null
    ? client.state_tax_rate / 100
    : getStateTaxRate(client.state);

  // Birth year for the forced-RMD logic in legacy mode (see deferral phase).
  const birthYear = getBirthYearFromAge(client.age ?? 65, startYear);

  // --- SSI config ---
  const primarySsStartAge = client.ssi_payout_age ?? 67;
  const primarySsAmount = client.ssi_annual_amount ?? 0;
  const spouseSsStartAge = client.spouse_ssi_payout_age ?? 67;
  const spouseSsAmount = client.spouse_ssi_annual_amount ?? 0;
  // Only carry spouse data when the filer is actually married. Stops a stale
  // spouse_age from leaking into the year-by-year table after an advisor
  // switches a client back to single/HoH.
  const isMarriedFiler = client.filing_status === 'married_filing_jointly'
    || client.filing_status === 'married_filing_separately';
  const useSpouseAgeBased = isMarriedFiler
    && client.spouse_age !== undefined
    && client.spouse_age !== null
    && client.spouse_age > 0;
  const initialSpouseAge = useSpouseAgeBased ? client.spouse_age! : null;
  const ssiColaRate = 0.02;

  // --- Rider fee config ---
  const riderFeeRate = productData ? productData.riderFee / 100 : 0;
  const riderFeeAppliesTo = productData?.riderFeeAppliesTo ?? 'incomeBase';

  // --- Initial values ---
  // Baseline: Traditional IRA grows during waiting period, then purchases GI at same age as strategy
  let traditionalBalance = client.qualified_account_value ?? 0;
  let accountValue = 0;
  let incomeBase = 0;
  let originalIncomeBase = 0;
  let giPurchased = false;
  let incomeBaseAtStart = 0;
  let incomeBaseAtIncomeAge = 0;
  let guaranteedAnnualIncome = 0;
  let payoutPercent = 0;
  let cumulativeIncome = 0;

  let taxableBalance = client.taxable_accounts ?? 0;

  // --- Tracking ---
  const incomeHistory = new Map<number, number>();
  let totalGrossPaid = 0;
  let totalNetPaid = 0;
  let totalTaxOnIncome = 0;
  let firstYearTax = 0;
  let firstYearNetIncome = 0;

  for (let yearOffset = 0; yearOffset < projectionYears; yearOffset++) {
    const year = startYear + yearOffset;
    const age = useAgeBased ? getAgeAtYearOffset(clientAge, yearOffset) : 62 + yearOffset;
    const spouseAge = isMarriedFiler && client.spouse_dob ? calculateAge(client.spouse_dob, year) : null;

    const boyAccount = accountValue;
    const boyTaxable = taxableBalance;

    // --- SSI income ---
    // SS is entered in TODAY'S dollars. COLA years = min(yearOffset, age - startAge):
    // a client already collecting at the projection start grows only from the start
    // (yearOffset) — anchoring to (age - startAge) would re-apply COLA already baked
    // into their current benefit and over-state it. A future collector still grows
    // from the claim age (age - startAge = 0 at claim), matching the entered amount.
    const primarySsIncome = age >= primarySsStartAge
      ? Math.round(primarySsAmount * Math.pow(1 + ssiColaRate, Math.min(yearOffset, age - primarySsStartAge)))
      : 0;

    let spouseSsIncome = 0;
    if (client.filing_status === 'married_filing_jointly' && spouseSsAmount > 0) {
      const currentSpouseAge = initialSpouseAge !== null ? initialSpouseAge + yearOffset : 0;
      spouseSsIncome = currentSpouseAge >= spouseSsStartAge
        ? Math.round(spouseSsAmount * Math.pow(1 + ssiColaRate, Math.min(yearOffset, currentSpouseAge - spouseSsStartAge)))
        : 0;
    }
    const ssIncome = primarySsIncome + spouseSsIncome;
    const otherIncome = getNonSSIIncomeForYear(client, year);
    const taxExemptNonSSI = getTaxExemptIncomeForYear(client, year);

    // --- Standard deduction ---
    // A (deduction isolation): GI BASELINE (do-nothing) — additional_deductions
    // are a strategy-only benefit, so pass null; only standard/senior applies.
    // The GI strategy path (~line 348) still passes client.additional_deductions.
    // See growth-baseline.ts for rationale (Mark Nichols audit 2026-07).
    const deductions = getEffectiveDeduction(client.filing_status, age, spouseAge ?? undefined, year, null);
    const boyTraditional = traditionalBalance;

    // Determine phase - baseline has: waiting, purchase, deferral, income
    let currentPhase: 'waiting' | 'purchase' | 'deferral' | 'income';
    if (age < purchaseAge) {
      currentPhase = 'waiting';
    } else if (age === purchaseAge && !giPurchased) {
      currentPhase = 'purchase';
    } else if (age < effectiveIncomeStartAge) {
      currentPhase = 'deferral';
    } else {
      currentPhase = 'income';
    }

    // =======================================================================
    // WAITING PHASE: Traditional IRA grows before GI purchase
    // =======================================================================
    if (currentPhase === 'waiting') {
      // Voluntary withdrawals on top of normal balance growth. Traditional
      // available = full boyTraditional (no RMD/conversion in waiting phase).
      // Roth balance is 0 in baseline — Roth withdrawals will resolve to 0.
      const wdW = resolveWithdrawalsForYear(client, year, traditionalBalance, 0);
      const iraWithdrawalW = wdW.iraPulled;
      const rothWithdrawalW = wdW.rothPulled; // always 0 in baseline waiting
      const earlyPenaltyW = earlyWithdrawalPenaltyOnIRA(age, iraWithdrawalW);
      traditionalBalance = traditionalBalance - iraWithdrawalW;

      // Traditional IRA grows on the post-withdrawal balance
      const iraGrowth = Math.round(traditionalBalance * rateOfReturn);
      traditionalBalance = traditionalBalance + iraGrowth;

      // Forced RMD in legacy mode. These pre-purchase "hold" years can fall past
      // the RMD age for older clients, so mirror the deferral-phase RMD here too
      // — otherwise an already-RMD-age client silently skips RMDs until the GI
      // purchase, understating "RMDs avoided". A voluntary IRA withdrawal above
      // already satisfies the RMD up to its amount. Gated on gi_legacy_mode.
      // NOTE: ungating this for NORMAL income mode (so the do-nothing baseline
      // also takes pre-income RMDs) is a known gap — DEFERRED pending validation
      // against carrier illustrations, because the deferral-phase RMD interacts
      // with benefit-base draw-down and income sizing in ways that swing real
      // client legacy by six figures (audit finding, June 2026 — see WISHLIST).
      let rmdAmount = 0;
      let rmdFederalTax = 0;
      let rmdStateTax = 0;
      if (client.gi_legacy_mode && !client.rmds_handled_externally && traditionalBalance > 0) {
        const rmdRequired = calculateRMD({ age, traditionalBalance: boyTraditional, birthYear }).rmdAmount;
        rmdAmount = Math.min(Math.max(0, rmdRequired - iraWithdrawalW), traditionalBalance);
        if (rmdAmount > 0) {
          traditionalBalance = Math.max(0, traditionalBalance - rmdAmount);
          const withRMD = computeTaxableIncomeWithSS({ otherIncome: otherIncome + iraWithdrawalW + rmdAmount, ssBenefits: ssIncome, taxExemptInterest: taxExemptNonSSI, deductions, filingStatus: client.filing_status, age, spouseAge: spouseAge ?? undefined, taxYear: year });
          const withoutRMD = computeTaxableIncomeWithSS({ otherIncome: otherIncome + iraWithdrawalW, ssBenefits: ssIncome, taxExemptInterest: taxExemptNonSSI, deductions, filingStatus: client.filing_status, age, spouseAge: spouseAge ?? undefined, taxYear: year });
          rmdFederalTax = Math.max(0, calculateFederalTax({ taxableIncome: withRMD.taxableIncome, filingStatus: client.filing_status, taxYear: year }).totalTax - calculateFederalTax({ taxableIncome: withoutRMD.taxableIncome, filingStatus: client.filing_status, taxYear: year }).totalTax);
          rmdStateTax = Math.max(0, calculateStateTax({ taxableIncome: withRMD.taxableIncome, state: client.state, filingStatus: client.filing_status, overrideRate: stateTaxRateDecimal }).totalTax - calculateStateTax({ taxableIncome: withoutRMD.taxableIncome, state: client.state, filingStatus: client.filing_status, overrideRate: stateTaxRateDecimal }).totalTax);
        }
      }
      const rmdNetW = rmdAmount - rmdFederalTax - rmdStateTax;
      // rmd_treatment: 'spent' consumes the after-tax RMD (gone from the estate);
      // 'reinvested' AND 'cash' both KEEP it — the only difference is growth.
      // Reinvested compounds at the rate of return; cash accumulates flat. The
      // prior `=== 'reinvested'` check silently DROPPED the 'cash' proceeds, so a
      // cash client's accumulated RMDs vanished from the legacy comparison.
      const treatmentW = client.rmd_treatment ?? 'reinvested';
      const rmdToTaxableW = treatmentW === 'spent' ? 0 : rmdNetW;

      // 'cash' = no growth on the accumulated balance; otherwise it grows.
      const taxableInterest = treatmentW === 'cash' ? 0 : Math.round(boyTaxable * rateOfReturn);
      taxableBalance = boyTaxable + taxableInterest + rmdToTaxableW;

      // IRMAA. Voluntary IRA pulls + forced RMD feed into MAGI/income like ordinary income.
      const magi = otherIncome + iraWithdrawalW + rmdAmount + taxExemptNonSSI + ssIncome;
      incomeHistory.set(year, magi);

      // IRMAA surcharge + tier both come from the same 2-year-lookback MAGI
      // so the displayed tier matches the dollar surcharge on the same row.
      // See baseline.ts for the longer rationale.
      let irmaaSurcharge = 0;
      let irmaaTierFromLookback = 0;
      if (age >= 65) {
        const irmaaResult = calculateIRMAAWithLookback(year, incomeHistory, client.filing_status);
        irmaaSurcharge = irmaaResult.annualSurcharge;
        irmaaTierFromLookback = irmaaResult.tier;
      }

      // Calculate tax details (with SS taxation awareness). RMD is ordinary income.
      const waitingTaxInfo = computeTaxableIncomeWithSS({
        otherIncome: otherIncome + iraWithdrawalW + rmdAmount,
        ssBenefits: ssIncome,
        taxExemptInterest: taxExemptNonSSI,
        deductions,
        filingStatus: client.filing_status,
        age,
        spouseAge: spouseAge ?? undefined,
        taxYear: year,
      });
      const totalIncome = otherIncome + iraWithdrawalW + rmdAmount + ssIncome;
      const agi = waitingTaxInfo.agi;
      const taxableIncome = waitingTaxInfo.taxableIncome;
      const federalTaxBracket = getMarginalBracket(taxableIncome, client.filing_status, year);
      const irmaaTier = irmaaTierFromLookback;

      // Account growth this year
      const traditionalGrowth = iraGrowth;
      const rothGrowth = 0;
      const taxableGrowth = taxableInterest;

      results.push({
        year, age, spouseAge,
        traditionalBalance,
        rothBalance: 0,
        taxableBalance,
        rmdAmount,
        conversionAmount: 0,
        ssIncome,
        pensionIncome: 0,
        otherIncome,
        totalIncome,
        federalTax: rmdFederalTax,
        stateTax: rmdStateTax,
        niitTax: 0,
        irmaaSurcharge,
        totalTax: rmdFederalTax + rmdStateTax + irmaaSurcharge + earlyPenaltyW,
        taxableSS: waitingTaxInfo.taxableSS,
        netWorth: traditionalBalance + taxableBalance,
        // Extended fields for adjustable columns
        traditionalBOY: boyTraditional,
        rothBOY: 0,
        taxableBOY: boyTaxable,
        traditionalGrowth,
        rothGrowth,
        taxableGrowth,
        productBonusApplied: 0, // No bonus during waiting
        magi,
        agi,
        standardDeduction: deductions,
        taxableIncome,
        federalTaxBracket,
        irmaaTier,
        federalTaxOnSS: 0,
        federalTaxOnConversions: 0,
        federalTaxOnOrdinaryIncome: 0,
        stateTaxOnSS: 0,
        stateTaxOnConversions: 0,
        stateTaxOnOrdinaryIncome: 0,
        totalIRAWithdrawal: iraWithdrawalW,
        iraWithdrawal: iraWithdrawalW,
        rothWithdrawal: rothWithdrawalW,
        earlyWithdrawalPenalty: earlyPenaltyW || undefined,
        // GI-specific fields
        incomeRiderValue: 0,
        accumulationValue: 0,
        incomePayoutAmount: 0,
        riderFee: 0,
        giPhase: 'waiting',
        giIncomeNet: 0,
        giCumulativeIncome: 0,
        giRollUpGrowth: 0,
        giPayoutRate: 0,
        giConversionTax: 0,
      });

      giYearlyData.push({
        year, age,
        phase: 'conversion', // Use 'conversion' to match strategy phase naming
        traditionalBalance,
        rothBalance: 0,
        conversionAmount: 0,
        conversionTax: 0,
        accountValue: 0,
        incomeBase: 0,
        guaranteedIncomeGross: 0,
        guaranteedIncomeNet: 0,
        riderFee: 0,
        cumulativeIncome: 0,
      });
      continue;
    }

    // =======================================================================
    // PURCHASE PHASE: Buy GI with grown Traditional IRA balance
    // =======================================================================
    if (currentPhase === 'purchase') {
      giPurchased = true;

      // Purchase amount is the grown Traditional IRA balance
      const purchaseAmount = traditionalBalance;
      traditionalBalance = 0;

      // Apply product-specific bonus logic
      if (productData) {
        const bonusRate = (client.bonus_percent ?? 0) / 100;

        if (productData.bonusAppliesTo === 'both' || productData.bonusAppliesTo === 'accountValue') {
          // Simple Roll-up Income: bonus goes to BOTH account value AND income base
          accountValue = Math.round(purchaseAmount * (1 + bonusRate));
          incomeBase = Math.round(purchaseAmount * (1 + bonusRate));
        } else if (productData.bonusAppliesTo === 'incomeBase') {
          accountValue = purchaseAmount;
          incomeBase = Math.round(purchaseAmount * (1 + bonusRate));
        } else {
          accountValue = purchaseAmount;
          incomeBase = purchaseAmount;
        }
      } else {
        const bonusRate = (client.bonus_percent ?? 0) / 100;
        accountValue = Math.round(purchaseAmount * (1 + bonusRate));
        incomeBase = accountValue;
      }

      originalIncomeBase = incomeBase;
      incomeBaseAtStart = incomeBase;

      // Apply FIRST year of roll-up during purchase phase (same as strategy)
      const incomeBasePrePurchaseRollUp = incomeBase;
      if (productData) {
        const rollUpInfo = getEffectiveRollUpForYear(productId, 1, rollUpOption, customProduct, rateOfReturn);
        if (rollUpInfo) {
          if (rollUpInfo.type === 'simple') {
            incomeBase = incomeBase + Math.round(originalIncomeBase * rollUpInfo.rate);
          } else {
            incomeBase = Math.round(incomeBase * (1 + rollUpInfo.rate));
          }
        }
      }
      const purchaseRollUpGrowth = incomeBase - incomeBasePrePurchaseRollUp;

      // Taxable account grows
      const taxableInterest = Math.round(boyTaxable * rateOfReturn);
      taxableBalance = boyTaxable + taxableInterest;

      // IRMAA
      const magi = otherIncome + taxExemptNonSSI + ssIncome;
      incomeHistory.set(year, magi);

      // IRMAA surcharge + tier both come from the same 2-year-lookback MAGI
      // so the displayed tier matches the dollar surcharge on the same row.
      // See baseline.ts for the longer rationale.
      let irmaaSurcharge = 0;
      let irmaaTierFromLookback = 0;
      if (age >= 65) {
        const irmaaResult = calculateIRMAAWithLookback(year, incomeHistory, client.filing_status);
        irmaaSurcharge = irmaaResult.annualSurcharge;
        irmaaTierFromLookback = irmaaResult.tier;
      }

      // Calculate tax details (with SS taxation awareness)
      const baselinePurchaseTaxInfo = computeTaxableIncomeWithSS({
        otherIncome,
        ssBenefits: ssIncome,
        taxExemptInterest: taxExemptNonSSI,
        deductions,
        filingStatus: client.filing_status,
        age,
        spouseAge: spouseAge ?? undefined,
        taxYear: year,
      });
      const totalIncome = otherIncome + ssIncome;
      const agi = baselinePurchaseTaxInfo.agi;
      const taxableIncome = baselinePurchaseTaxInfo.taxableIncome;
      const federalTaxBracket = getMarginalBracket(taxableIncome, client.filing_status, year);
      const irmaaTier = irmaaTierFromLookback;

      // Account growth this year
      const traditionalGrowth = 0; // Purchased this year
      const rothGrowth = 0;
      const taxableGrowth = taxableInterest;

      // Calculate bonus amount
      const bonusRate = (client.bonus_percent ?? 0) / 100;
      const productBonusApplied = Math.round(purchaseAmount * bonusRate);

      results.push({
        year, age, spouseAge,
        traditionalBalance: accountValue,
        rothBalance: 0,
        taxableBalance,
        rmdAmount: 0,
        conversionAmount: 0,
        ssIncome,
        pensionIncome: 0,
        otherIncome,
        totalIncome,
        federalTax: 0,
        stateTax: 0,
        niitTax: 0,
        irmaaSurcharge,
        totalTax: irmaaSurcharge,
        taxableSS: baselinePurchaseTaxInfo.taxableSS,
        netWorth: accountValue + taxableBalance,
        // Extended fields for adjustable columns
        traditionalBOY: boyTraditional,
        rothBOY: 0,
        taxableBOY: boyTaxable,
        traditionalGrowth,
        rothGrowth,
        taxableGrowth,
        productBonusApplied,
        magi,
        agi,
        standardDeduction: deductions,
        taxableIncome,
        federalTaxBracket,
        irmaaTier,
        federalTaxOnSS: 0,
        federalTaxOnConversions: 0,
        federalTaxOnOrdinaryIncome: 0,
        stateTaxOnSS: 0,
        stateTaxOnConversions: 0,
        stateTaxOnOrdinaryIncome: 0,
        // GI-specific fields
        incomeRiderValue: incomeBase,
        accumulationValue: accountValue,
        incomePayoutAmount: 0,
        riderFee: 0,
        giPhase: 'purchase',
        giIncomeNet: 0,
        giCumulativeIncome: 0,
        giRollUpGrowth: purchaseRollUpGrowth,
        giPayoutRate: 0,
        giConversionTax: 0,
      });

      giYearlyData.push({
        year, age,
        phase: 'purchase',
        traditionalBalance: 0,
        rothBalance: 0,
        conversionAmount: 0,
        conversionTax: 0,
        accountValue,
        incomeBase,
        guaranteedIncomeGross: 0,
        guaranteedIncomeNet: 0,
        riderFee: 0,
        cumulativeIncome: 0,
      });
      continue;
    }

    // =======================================================================
    // DEFERRAL PHASE: Income Base grows via roll-up
    // =======================================================================
    if (currentPhase === 'deferral') {
      const deferralYear = age - purchaseAge + 1; // 1-indexed to match strategy

      // Roll up Income Base
      const incomeBasePreRollUp = incomeBase;
      if (productData) {
        const rollUpInfo = getEffectiveRollUpForYear(productId, deferralYear, rollUpOption, customProduct, rateOfReturn);
        if (rollUpInfo) {
          if (rollUpInfo.creditBasis === 'account_value') {
            // Pattern B (Athene Agility): grow the base by the multiple of the
            // DOLLARS credited to the account value this year. accountValue here
            // is the beginning-of-year AV (it grows just below), matching the
            // carrier's "200% of the dollar amount credited to the Accumulated
            // Value". rollUpInfo.rate = multiple × creditedRate.
            incomeBase = incomeBase + Math.round(rollUpInfo.rate * accountValue);
          } else if (rollUpInfo.type === 'simple') {
            incomeBase = incomeBase + Math.round(originalIncomeBase * rollUpInfo.rate);
          } else {
            incomeBase = Math.round(incomeBase * (1 + rollUpInfo.rate));
          }
        }
      }
      const deferralRollUpGrowth = incomeBase - incomeBasePreRollUp;

      // At the year BEFORE income starts, lock in income base and payout
      if (age + 1 === effectiveIncomeStartAge) {
        incomeBaseAtIncomeAge = incomeBase;
        const payoutFactor = productData
          ? getEffectivePayoutFactor(productId, payoutType, effectiveIncomeStartAge, payoutOption, customProduct)
          : 0.05;
        payoutPercent = payoutFactor * 100;
        guaranteedAnnualIncome = Math.round(incomeBaseAtIncomeAge * payoutFactor);
      }

      // Account value grows
      const accountInterest = Math.round(accountValue * rateOfReturn);
      accountValue = accountValue + accountInterest;

      // Deduct rider fee
      let yearRiderFee = 0;
      if (riderFeeRate > 0) {
        const feeBase = riderFeeAppliesTo === 'accountValue' ? accountValue : incomeBase;
        yearRiderFee = Math.round(feeBase * riderFeeRate);
        accountValue = Math.max(0, accountValue - yearRiderFee);
      }

      // ---- Forced RMD (pre-income deferral / hold years) ----
      // While the traditional annuity is held and no income is coming out, once
      // the owner is past their RMD age the IRS forces a taxable distribution
      // each year, eroding the account value and (pro-rata) the benefit base.
      // This is exactly the "no RMDs" advantage of converting to Roth: the
      // strategy side is Roth and takes none, so this only ever hits the
      // do-nothing baseline. Gated on gi_legacy_mode so existing income scenarios
      // (where the guaranteed income already satisfies the RMD) are unchanged.
      // NOTE: ungating for NORMAL income mode's pre-income deferral years is a
      // known gap — DEFERRED pending validation against carrier illustrations,
      // because the deferral-phase RMD's pro-rata benefit-base draw-down swings
      // real client legacy by six figures (audit finding, June 2026 — WISHLIST).
      // Honors rmds_handled_externally and rmd_treatment.
      let rmdAmount = 0;
      let rmdFederalTax = 0;
      let rmdStateTax = 0;
      if (client.gi_legacy_mode && !client.rmds_handled_externally && accountValue > 0) {
        const avBeforeRmd = accountValue; // post-interest, post-fee contract value
        rmdAmount = Math.min(calculateRMD({ age, traditionalBalance: boyAccount, birthYear }).rmdAmount, avBeforeRmd);
        if (rmdAmount > 0) {
          // Benefit base (= death benefit) draws down pro-rata for products where
          // it tracks the contract value (carrier rule, e.g. Athene's "RMDs
          // proportionally reduce the Income Base").
          if (productData?.benefitBaseDrawsDown && avBeforeRmd > 0) {
            incomeBase = Math.round(incomeBase * (1 - rmdAmount / avBeforeRmd));
          }
          accountValue = Math.max(0, accountValue - rmdAmount);
          // MARGINAL tax of the RMD = tax(other + RMD + SS) − tax(other + SS).
          // Isolating the incremental cost keeps the comparison fair: the Roth
          // strategy pays no tax in these hold years, so only the RMD's own tax
          // should weigh against the baseline (not the background SS/other-income
          // tax, which is identical on both sides).
          const withRMD = computeTaxableIncomeWithSS({ otherIncome: otherIncome + rmdAmount, ssBenefits: ssIncome, taxExemptInterest: taxExemptNonSSI, deductions, filingStatus: client.filing_status, age, spouseAge: spouseAge ?? undefined, taxYear: year });
          const withoutRMD = computeTaxableIncomeWithSS({ otherIncome, ssBenefits: ssIncome, taxExemptInterest: taxExemptNonSSI, deductions, filingStatus: client.filing_status, age, spouseAge: spouseAge ?? undefined, taxYear: year });
          rmdFederalTax = Math.max(0, calculateFederalTax({ taxableIncome: withRMD.taxableIncome, filingStatus: client.filing_status, taxYear: year }).totalTax - calculateFederalTax({ taxableIncome: withoutRMD.taxableIncome, filingStatus: client.filing_status, taxYear: year }).totalTax);
          rmdStateTax = Math.max(0, calculateStateTax({ taxableIncome: withRMD.taxableIncome, state: client.state, filingStatus: client.filing_status, overrideRate: stateTaxRateDecimal }).totalTax - calculateStateTax({ taxableIncome: withoutRMD.taxableIncome, state: client.state, filingStatus: client.filing_status, overrideRate: stateTaxRateDecimal }).totalTax);
        }
      }
      // After-tax RMD proceeds. 'spent' consumes them; 'reinvested' and 'cash'
      // both keep them (reinvested grows at the rate of return, cash stays flat).
      // The old `=== 'reinvested'` check dropped 'cash' proceeds entirely.
      const rmdNet = rmdAmount - rmdFederalTax - rmdStateTax;
      const treatment = client.rmd_treatment ?? 'reinvested';
      const rmdToTaxable = treatment === 'spent' ? 0 : rmdNet;

      // 'cash' = no growth on the accumulated balance; otherwise it grows.
      const taxableInterest = treatment === 'cash' ? 0 : Math.round(boyTaxable * rateOfReturn);
      taxableBalance = boyTaxable + taxableInterest + rmdToTaxable;

      // IRMAA (the RMD counts toward MAGI)
      const magi = otherIncome + rmdAmount + taxExemptNonSSI + ssIncome;
      incomeHistory.set(year, magi);

      // IRMAA surcharge + tier both come from the same 2-year-lookback MAGI
      // so the displayed tier matches the dollar surcharge on the same row.
      // See baseline.ts for the longer rationale.
      let irmaaSurcharge = 0;
      let irmaaTierFromLookback = 0;
      if (age >= 65) {
        const irmaaResult = calculateIRMAAWithLookback(year, incomeHistory, client.filing_status);
        irmaaSurcharge = irmaaResult.annualSurcharge;
        irmaaTierFromLookback = irmaaResult.tier;
      }

      // Calculate tax details (with SS taxation awareness). The RMD is ordinary
      // income, so it flows into AGI / taxable income / bracket display.
      const baselineDeferralTaxInfo = computeTaxableIncomeWithSS({
        otherIncome: otherIncome + rmdAmount,
        ssBenefits: ssIncome,
        taxExemptInterest: taxExemptNonSSI,
        deductions,
        filingStatus: client.filing_status,
        age,
        spouseAge: spouseAge ?? undefined,
        taxYear: year,
      });
      const totalIncome = otherIncome + rmdAmount + ssIncome;
      const agi = baselineDeferralTaxInfo.agi;
      const taxableIncome = baselineDeferralTaxInfo.taxableIncome;
      const federalTaxBracket = getMarginalBracket(taxableIncome, client.filing_status, year);
      const irmaaTier = irmaaTierFromLookback;

      // Account growth this year (interest before rider fee)
      const traditionalGrowth = accountInterest;
      const rothGrowth = 0;
      const taxableGrowth = taxableInterest;

      results.push({
        year, age, spouseAge,
        traditionalBalance: accountValue,
        rothBalance: 0,
        taxableBalance,
        rmdAmount,
        conversionAmount: 0,
        ssIncome,
        pensionIncome: 0,
        otherIncome,
        totalIncome,
        federalTax: rmdFederalTax,
        stateTax: rmdStateTax,
        niitTax: 0,
        irmaaSurcharge,
        totalTax: rmdFederalTax + rmdStateTax + irmaaSurcharge,
        taxableSS: baselineDeferralTaxInfo.taxableSS,
        netWorth: accountValue + taxableBalance,
        // Extended fields for adjustable columns
        traditionalBOY: boyAccount,
        rothBOY: 0,
        taxableBOY: boyTaxable,
        traditionalGrowth,
        rothGrowth,
        taxableGrowth,
        productBonusApplied: 0, // No bonus during deferral
        magi,
        agi,
        standardDeduction: deductions,
        taxableIncome,
        federalTaxBracket,
        irmaaTier,
        federalTaxOnSS: 0,
        federalTaxOnConversions: 0,
        federalTaxOnOrdinaryIncome: 0,
        stateTaxOnSS: 0,
        stateTaxOnConversions: 0,
        stateTaxOnOrdinaryIncome: 0,
        // GI-specific fields
        incomeRiderValue: incomeBase,
        accumulationValue: accountValue,
        incomePayoutAmount: 0,
        riderFee: yearRiderFee,
        giPhase: 'deferral',
        giIncomeNet: 0,
        giCumulativeIncome: 0,
        giRollUpGrowth: deferralRollUpGrowth,
        giPayoutRate: 0,
        giConversionTax: 0,
      });

      giYearlyData.push({
        year, age,
        phase: 'deferral',
        traditionalBalance: accountValue,
        rothBalance: 0,
        conversionAmount: 0,
        conversionTax: 0,
        accountValue,
        incomeBase,
        guaranteedIncomeGross: 0,
        guaranteedIncomeNet: 0,
        riderFee: yearRiderFee,
        cumulativeIncome: 0,
      });
    }
    // =======================================================================
    // INCOME PHASE: Taxable guaranteed income
    // =======================================================================
    else {
      // On first income year, lock in if not already done
      if (guaranteedAnnualIncome === 0) {
        incomeBaseAtIncomeAge = incomeBase;
        const payoutFactor = productData
          ? getEffectivePayoutFactor(productId, payoutType, effectiveIncomeStartAge, payoutOption, customProduct)
          : 0.05;
        payoutPercent = payoutFactor * 100;
        guaranteedAnnualIncome = Math.round(incomeBaseAtIncomeAge * payoutFactor);
      }

      // For "increasing" LPA option, apply annual increase after first year.
      // See strategy scenario above — 'credited_rate' basis ties the step-up to
      // the assumed crediting rate (0% floor); 'fixed' uses the preset rate.
      const yearsOfIncome = age - effectiveIncomeStartAge;
      let grossGI = guaranteedAnnualIncome;
      if (payoutOption === 'increasing' && yearsOfIncome > 0) {
        const increaseRate = getEffectiveIncreasingIncomeRate(productId, customProduct, rateOfReturn);
        if (increaseRate > 0) {
          grossGI = Math.round(guaranteedAnnualIncome * Math.pow(1 + increaseRate, yearsOfIncome));
        }
      }

      // TAXABLE because it's inside a Traditional IRA — and GI income drives
      // provisional income up, so Social Security taxation must be applied too.
      const grossTaxableIncome = grossGI + otherIncome;
      const baselineIncomeTaxInfo = computeTaxableIncomeWithSS({
        otherIncome: grossTaxableIncome,
        ssBenefits: ssIncome,
        taxExemptInterest: taxExemptNonSSI,
        deductions,
        filingStatus: client.filing_status,
        age,
        spouseAge: spouseAge ?? undefined,
        taxYear: year,
      });
      const taxableIncome = baselineIncomeTaxInfo.taxableIncome;

      const federalResult = calculateFederalTax({
        taxableIncome,
        filingStatus: client.filing_status,
        taxYear: year,
      });

      const stateResult = calculateStateTax({
        taxableIncome,
        state: client.state,
        filingStatus: client.filing_status,
        overrideRate: stateTaxRateDecimal,
      });

      // IRMAA (Traditional GI income counts toward MAGI)
      const magi = grossTaxableIncome + taxExemptNonSSI + ssIncome;
      incomeHistory.set(year, magi);

      // IRMAA surcharge + tier both come from the same 2-year-lookback MAGI
      // so the displayed tier matches the dollar surcharge on the same row.
      // See baseline.ts for the longer rationale.
      let irmaaSurcharge = 0;
      let irmaaTierFromLookback = 0;
      if (age >= 65) {
        const irmaaResult = calculateIRMAAWithLookback(year, incomeHistory, client.filing_status);
        irmaaSurcharge = irmaaResult.annualSurcharge;
        irmaaTierFromLookback = irmaaResult.tier;
      }

      const totalTax = federalResult.totalTax + stateResult.totalTax + irmaaSurcharge;
      const netGI = grossGI - federalResult.totalTax - stateResult.totalTax;

      // Track first year values
      if (totalGrossPaid === 0) {
        firstYearTax = federalResult.totalTax + stateResult.totalTax;
        firstYearNetIncome = netGI;
      }

      totalGrossPaid += grossGI;
      totalNetPaid += netGI;
      totalTaxOnIncome += federalResult.totalTax + stateResult.totalTax;
      cumulativeIncome += netGI;

      // Pro-rata benefit-base draw-down (Allianz 222 / Athene Agility): the
      // benefit base (= enhanced death benefit) reduces by the SAME proportion
      // the income withdrawal reduces the account value. Opt-in per product —
      // classic GLWBs keep the income base LOCKED during guaranteed income and
      // only reduce it on excess withdrawals (benefitBaseDrawsDown = false).
      // Verified to the dollar vs the Agility/222 illustrations
      // (yr1 income: $465,000 × (1 − 23,250/300,000) = $428,963).
      if (productData?.benefitBaseDrawsDown && boyAccount > 0) {
        const withdrawalFraction = Math.min(1, grossGI / boyAccount);
        // Draw down `incomeBase` (the death-benefit value during income), NOT
        // incomeBaseAtIncomeAge — the latter is the LOCKED income-base metric
        // and must stay fixed (it sizes the income + is reported as "income base
        // at income age"). At the income lock they're equal; here they diverge.
        incomeBase = Math.round(incomeBase * (1 - withdrawalFraction));
      }

      // Deduct GI payment from account value
      accountValue = boyAccount - grossGI;
      if (accountValue < 0) {
        accountValue = 0;
      }

      // Interest on remaining account value
      const accountInterest = Math.round(accountValue * rateOfReturn);
      accountValue = accountValue + accountInterest;

      // Deduct rider fee
      let yearRiderFee = 0;
      if (riderFeeRate > 0 && accountValue > 0) {
        const feeBase = riderFeeAppliesTo === 'accountValue' ? accountValue : incomeBase;
        yearRiderFee = Math.round(feeBase * riderFeeRate);
        accountValue = Math.max(0, accountValue - yearRiderFee);
      }

      // Taxable account receives after-tax GI income
      const taxableInterest = Math.round(boyTaxable * rateOfReturn);
      taxableBalance = boyTaxable + grossGI + taxableInterest - totalTax;

      // Calculate tax details. AGI/taxable-SS already computed above.
      const totalIncome = grossTaxableIncome + ssIncome;
      const agi = baselineIncomeTaxInfo.agi;
      const federalTaxBracket = getMarginalBracket(taxableIncome, client.filing_status, year);
      const irmaaTier = irmaaTierFromLookback;

      // Split federal/state tax between "on ordinary/GI" and "on taxable SS".
      const ssPart = baselineIncomeTaxInfo.taxableSS;
      const ordPart = grossTaxableIncome;
      const denom = ssPart + ordPart;
      const baselineFedTaxOnSS = denom > 0 && ssPart > 0
        ? Math.round(federalResult.totalTax * ssPart / denom) : 0;
      const baselineStateTaxOnSS = denom > 0 && ssPart > 0
        ? Math.round(stateResult.totalTax * ssPart / denom) : 0;

      // Account growth this year (interest after payout, before rider fee)
      const traditionalGrowth = accountInterest;
      const rothGrowth = 0;
      const taxableGrowth = taxableInterest;

      results.push({
        year, age, spouseAge,
        traditionalBalance: accountValue,
        rothBalance: 0,
        taxableBalance,
        rmdAmount: grossGI,
        conversionAmount: 0,
        ssIncome,
        pensionIncome: 0,
        otherIncome,
        totalIncome,
        federalTax: federalResult.totalTax,
        stateTax: stateResult.totalTax,
        niitTax: 0,
        irmaaSurcharge,
        totalTax,
        taxableSS: baselineIncomeTaxInfo.taxableSS,
        netWorth: accountValue + taxableBalance,
        // Extended fields for adjustable columns
        traditionalBOY: boyAccount,
        rothBOY: 0,
        taxableBOY: boyTaxable,
        traditionalGrowth,
        rothGrowth,
        taxableGrowth,
        productBonusApplied: 0, // No bonus during income phase
        magi,
        agi,
        standardDeduction: deductions,
        taxableIncome,
        federalTaxBracket,
        irmaaTier,
        federalTaxOnSS: baselineFedTaxOnSS,
        federalTaxOnConversions: 0,
        federalTaxOnOrdinaryIncome: federalResult.totalTax - baselineFedTaxOnSS,
        stateTaxOnSS: baselineStateTaxOnSS,
        stateTaxOnConversions: 0,
        stateTaxOnOrdinaryIncome: stateResult.totalTax - baselineStateTaxOnSS,
        // GI-specific fields
        incomeRiderValue: incomeBase,
        accumulationValue: accountValue,
        incomePayoutAmount: grossGI,
        riderFee: yearRiderFee,
        giPhase: 'income',
        giIncomeNet: netGI,
        giCumulativeIncome: cumulativeIncome,
        giRollUpGrowth: 0,
        giPayoutRate: payoutPercent,
        giConversionTax: 0,
      });

      giYearlyData.push({
        year, age,
        phase: 'income',
        traditionalBalance: accountValue,
        rothBalance: 0,
        conversionAmount: 0,
        conversionTax: 0,
        accountValue,
        incomeBase: incomeBase,
        guaranteedIncomeGross: grossGI,
        guaranteedIncomeNet: netGI,
        riderFee: yearRiderFee,
        cumulativeIncome,
      });
    }
  }

  const baselineMetrics: GIBaselineMetrics = {
    annualIncomeGross: guaranteedAnnualIncome,
    annualIncomeNet: firstYearNetIncome,
    annualTax: firstYearTax,
    lifetimeIncomeGross: totalGrossPaid,
    lifetimeIncomeNet: totalNetPaid,
    lifetimeTax: totalTaxOnIncome,
    incomeStartAge: effectiveIncomeStartAge,
    incomeBaseAtIncomeAge,
    yearlyData: giYearlyData,
  };

  // Tax-credit carryforward pool — the "do nothing" GI baseline gets the FULL
  // pool too, offsetting its RMD/withdrawal federal tax. Post-pass; no-op when
  // the client has no credit.
  applyTaxCreditCarryforward(results, client.tax_credits);

  return { baseline: results, baselineMetrics, baselineGIYearlyData: giYearlyData };
}

// ---------------------------------------------------------------------------
// Comparison Metrics Calculation
// ---------------------------------------------------------------------------

function calculateComparisonMetrics(
  strategy: GIStrategyMetrics & { incomeBaseAtStart: number },
  baseline: GIBaselineMetrics,
  // Previously took a flatTaxRate parameter sourced from client.tax_rate and
  // used it to OVERRIDE the bracket-aware baseline figures the engine had
  // just computed year-by-year (federal + state + IRMAA via calculateFederalTax
  // and calculateStateTax in runGIBaselineScenario). That override was the only
  // reason the "Current Bracket (informational)" form field existed — labeled
  // as informational but actually load-bearing for GI projections. Removed
  // 2026-06-05 in favor of the real numbers the engine already produces.
  _endAge: number = 100
): GIComparisonMetrics {
  // Baseline figures here come straight from the per-year simulation in
  // runGIBaselineScenario — they include real federal brackets, state tax,
  // and IRMAA, and they reflect the actual income mix (GI + SS + non-SSI)
  // rather than a flat-rate approximation.
  const baselineGross = baseline.annualIncomeGross;
  const baselineAnnualTax = baseline.annualTax;
  const baselineAnnualNet = baseline.annualIncomeNet;
  const baselineLifetimeNet = baseline.lifetimeIncomeNet;

  // Annual advantage: Strategy (tax-free) vs Baseline (bracket-aware net)
  const annualAdvantage = strategy.annualIncomeNet - baselineAnnualNet;

  // Lifetime advantage uses simulated totals on both sides — handles
  // increasing-payout GI products correctly.
  const lifetimeAdvantage = strategy.lifetimeIncomeNet - baselineLifetimeNet;

  // Break-even years = Conversion Tax / Annual Advantage
  const breakEvenYears = annualAdvantage > 0
    ? Math.ceil(strategy.totalConversionTax / annualAdvantage)
    : null;

  const breakEvenAge = breakEvenYears !== null
    ? strategy.incomeStartAge + breakEvenYears
    : null;

  // Percentage improvement
  const percentImprovement = baselineLifetimeNet > 0
    ? (lifetimeAdvantage / baselineLifetimeNet) * 100
    : 0;

  return {
    // Strategy (Roth GI)
    strategyAnnualIncomeGross: strategy.annualIncomeGross,
    strategyAnnualIncomeNet: strategy.annualIncomeNet, // Same as gross
    strategyLifetimeIncomeGross: strategy.lifetimeIncomeGross,
    strategyLifetimeIncomeNet: strategy.lifetimeIncomeNet,
    strategyTotalConversionTax: strategy.totalConversionTax,
    strategyIncomeBase: strategy.incomeBaseAtIncomeAge,

    // Baseline (Traditional GI) — bracket-aware values from the year-by-year sim
    baselineAnnualIncomeGross: baselineGross,
    baselineAnnualIncomeNet: baselineAnnualNet,
    baselineLifetimeIncomeGross: baseline.lifetimeIncomeGross,
    baselineLifetimeIncomeNet: baselineLifetimeNet,
    baselineAnnualTax: baselineAnnualTax,
    baselineIncomeBase: baseline.incomeBaseAtIncomeAge,

    // Comparison
    annualIncomeAdvantage: annualAdvantage,
    lifetimeIncomeAdvantage: lifetimeAdvantage,
    taxFreeWealthCreated: lifetimeAdvantage,
    breakEvenYears,
    breakEvenAge,
    percentImprovement,
  };
}
