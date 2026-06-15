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
import { getStandardDeduction } from '@/lib/data/standard-deductions';
import { getStateTaxRate } from '@/lib/data/states';
import { type GIProductData } from '@/lib/config/gi-product-data';
import type { GuaranteedIncomeFormulaType } from '@/lib/config/products';
import {
  getEffectiveGIData,
  getEffectivePayoutFactor,
  getEffectiveRollUpForYear,
  getEffectiveIncreasingLPARate,
} from '../resolvers/product-resolver';
import { resolveWithdrawalsForYear, earlyWithdrawalPenaltyOnIRA } from '../utils/withdrawals';
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

  const baseHeirTax = Math.round(lastBase.traditionalBalance * heirRate);
  const blueHeirTax = Math.round(lastFormula.traditionalBalance * heirRate);

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
  const effectiveIncomeStartAge = Math.max(client.income_start_age ?? 65, clientAge);
  const payoutType = client.payout_type ?? 'individual';
  const payoutOption = client.payout_option ?? 'level';
  const rollUpOption = client.roll_up_option ?? null;

  // --- Conversion timing ---
  const conversionYears = client.gi_conversion_years ?? 5;
  const conversionBracket = client.gi_conversion_bracket ?? client.max_tax_rate ?? 24;
  const conversionEndAge = clientAge + conversionYears - 1;
  const purchaseAge = conversionEndAge + 1;

  // Calculate deferral years (from purchase to income start)
  const deferralYears = Math.max(0, effectiveIncomeStartAge - purchaseAge);

  // --- Tax config ---
  const stateTaxRateDecimal = client.state_tax_rate !== undefined && client.state_tax_rate !== null
    ? client.state_tax_rate / 100
    : getStateTaxRate(client.state);
  const payTaxFromIRA = client.tax_payment_source === 'from_ira';

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
    const primaryYearsCollecting = age >= primarySsStartAge ? age - primarySsStartAge : -1;
    const primarySsIncome = primaryYearsCollecting >= 0
      ? Math.round(primarySsAmount * Math.pow(1 + ssiColaRate, primaryYearsCollecting))
      : 0;

    let spouseSsIncome = 0;
    if (client.filing_status === 'married_filing_jointly' && spouseSsAmount > 0) {
      const currentSpouseAge = initialSpouseAge !== null ? initialSpouseAge + yearOffset : 0;
      const spouseYearsCollecting = currentSpouseAge >= spouseSsStartAge ? currentSpouseAge - spouseSsStartAge : -1;
      spouseSsIncome = spouseYearsCollecting >= 0
        ? Math.round(spouseSsAmount * Math.pow(1 + ssiColaRate, spouseYearsCollecting))
        : 0;
    }
    const ssIncome = primarySsIncome + spouseSsIncome;
    const otherIncome = getNonSSIIncomeForYear(client, year);
    const taxExemptNonSSI = getTaxExemptIncomeForYear(client, year);

    // --- Standard deduction ---
    const deductions = getStandardDeduction(client.filing_status, age, spouseAge ?? undefined, year);

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
      // Subtract immediately so conversion math sees the right balance.
      let availableTraditional = boyTraditional - iraWithdrawalGI;
      const availableRoth = boyRoth - rothWithdrawalGI;

      // Check if this is the LAST year of conversion phase
      const isLastConversionYear = age === conversionEndAge;

      if (availableTraditional > 0) {
        if (isLastConversionYear) {
          // LAST YEAR: Convert ALL remaining Traditional to ensure everything goes into Roth GI
          // This maximizes tax-free income by getting all money into the Roth strategy
          conversionAmount = availableTraditional;
        } else {
          // For other years, use FIXED annual conversion amount
          conversionAmount = Math.min(fixedAnnualConversion, availableTraditional);
        }

        // Handle tax payment from IRA.
        // Key insight: when the IRA funds its own tax, the tax withheld is
        // ALSO a taxable distribution on the 1099-R. So the TOTAL IRA
        // withdrawal (conversion + tax) is taxed, not just the conversion.
        // At a flat rate:
        //   total_dist × rate = tax     (tax on full distribution)
        //   conversion + tax  = total_dist
        //   => tax        = conversion × rate / (1 − rate)
        //   => total_dist = conversion / (1 − rate)
        // The prior formula `tax = conversion × rate` under-reported tax
        // by ~rate × (conversion × rate / (1-rate)) — exactly the
        // tax-on-tax amount that left the client with a surprise bill.
        if (payTaxFromIRA && conversionAmount > 0) {
          const effectiveRate = conversionBracket / 100 + stateTaxRateDecimal;
          if (isLastConversionYear) {
            // Full conversion: empty the IRA. total_dist = balance, so
            // conversion = balance × (1 − rate).
            conversionAmount = Math.round(availableTraditional * (1 - effectiveRate));
          } else {
            // Fixed amount: cap so the SELF-CONSISTENT total (conv/(1-rate))
            // fits inside the IRA. This is tighter than the old cap because
            // tax-on-tax is higher than tax-on-conversion-alone.
            const maxConvWithSelfConsistentTax = Math.floor(availableTraditional * (1 - effectiveRate));
            conversionAmount = Math.min(conversionAmount, maxConvWithSelfConsistentTax);
          }
          conversionAmount = Math.max(0, Math.min(conversionAmount, availableTraditional));
        }

        // Calculate conversion tax (flat rate). When paying from the IRA, the
        // tax must be computed on the TOTAL distribution (gross-up), not on
        // the conversion alone — otherwise the reported tax is less than what
        // the IRS would actually owe on the 1099-R.
        if (conversionAmount > 0) {
          if (payTaxFromIRA) {
            const fedRate = conversionBracket / 100;
            const stateRate = stateTaxRateDecimal;
            // Gross-up: tax = conversion × rate / (1 − rate)
            const totalRate = fedRate + stateRate;
            const totalTaxGrossed = totalRate > 0 && totalRate < 1
              ? Math.round(conversionAmount * totalRate / (1 - totalRate))
              : 0;
            // Split fed / state proportionally
            federalConversionTax = totalRate > 0
              ? Math.round(totalTaxGrossed * fedRate / totalRate)
              : 0;
            stateConversionTax = totalTaxGrossed - federalConversionTax;
          } else {
            federalConversionTax = Math.round(conversionAmount * (conversionBracket / 100));
            stateConversionTax = Math.round(conversionAmount * stateTaxRateDecimal);
          }
        }
      }

      const conversionTax = federalConversionTax + stateConversionTax;
      totalConversionTax += conversionTax;

      // Execute conversion. The voluntary withdrawals were already netted out
      // of availableTraditional / availableRoth above, so we apply conversion
      // on top of those reduced balances.
      const conversionTaxFromIRA = payTaxFromIRA ? conversionTax : 0;
      traditionalBalance = availableTraditional - conversionAmount - conversionTaxFromIRA;
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
      // Voluntary IRA pulls (iraWithdrawalGI) join the same ordinary-income
      // bucket; voluntary Roth pulls are tax-free and excluded.
      const grossIncomeWithConversion = otherIncome + conversionAmount + conversionTaxFromIRA + iraWithdrawalGI;
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
      const conversionTaxPenalty =
        conversionTaxFromIRA > 0 && age < 60
          ? Math.round(conversionTaxFromIRA * 0.10)
          : 0;
      const voluntaryWithdrawalPenalty = earlyWithdrawalPenaltyOnIRA(age, iraWithdrawalGI);
      const earlyWithdrawalPenalty = conversionTaxPenalty + voluntaryWithdrawalPenalty;

      const totalTax = conversionTax + irmaaSurcharge + earlyWithdrawalPenalty;

      // Handle tax payment on taxable account.
      // When payTaxFromIRA, conversion tax came from the IRA, but IRMAA and
      // early withdrawal penalty are still paid externally.
      // Clamp at $0 (Jorge V., ticket 809a5774) — once the qualified buckets
      // and the taxable account drain, residual non-conversion tax (on SS,
      // non_ssi_income, etc.) is assumed paid from external income rather
      // than driving taxableBalance into the negatives. TODO: replace with
      // proper external-income credit (option B) for full accuracy.
      const desiredTaxable = payTaxFromIRA
        ? boyTaxable + taxableInterest - Math.max(0, totalTax - conversionTaxFromIRA)
        : boyTaxable + taxableInterest - conversionTax - irmaaSurcharge - earlyWithdrawalPenalty;
      taxableBalance = Math.max(0, desiredTaxable);

      // Calculate tax details with SS taxation awareness.
      const convPhaseTaxInfo = computeTaxableIncomeWithSS({
        otherIncome: grossIncomeWithConversion,
        ssBenefits: ssIncome,
        taxExemptInterest: taxExemptNonSSI,
        deductions,
        filingStatus: client.filing_status,
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
        rmdAmount: 0,
        conversionAmount,
        ssIncome,
        pensionIncome: 0,
        otherIncome,
        totalIncome,
        federalTax: federalConversionTax,
        stateTax: stateConversionTax,
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
        federalTaxOnOrdinaryIncome: 0,
        stateTaxOnSS: 0,
        stateTaxOnConversions: stateConversionTax,
        stateTaxOnOrdinaryIncome: 0,
        totalIRAWithdrawal: conversionAmount + conversionTaxFromIRA + iraWithdrawalGI,
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
          if (rollUpInfo.type === 'simple') {
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
          if (rollUpInfo.type === 'simple') {
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

      // For "increasing" LPA option, apply annual increase after first year
      // Per Flat-Rate Compound Income spec: income grows by ~2% annually (minimum 0.25%)
      const yearsOfIncome = age - effectiveIncomeStartAge;
      let grossGI = guaranteedAnnualIncome;
      if (payoutOption === 'increasing' && yearsOfIncome > 0) {
        const increaseRate = getEffectiveIncreasingLPARate(productId, customProduct);
        if (increaseRate > 0) {
          grossGI = Math.round(guaranteedAnnualIncome * Math.pow(1 + increaseRate, yearsOfIncome));
        }
      }

      // TAX-FREE because it's inside a Roth IRA!
      const netGI = grossGI; // No tax on Roth distributions

      totalGrossPaid += grossGI;
      totalNetPaid += netGI;
      cumulativeIncome += netGI;

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
        const feeBase = riderFeeAppliesTo === 'accountValue' ? accountValue : incomeBaseAtIncomeAge;
        yearRiderFee = Math.round(feeBase * riderFeeRate);
        accountValue = Math.max(0, accountValue - yearRiderFee);
        totalRiderFees += yearRiderFee;
      }

      // Taxable account receives tax-free GI income
      const taxableInterest = Math.round(boyTaxable * rateOfReturn);
      taxableBalance = boyTaxable + grossGI + taxableInterest;

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
      });
      const totalIncome = grossGI + otherIncome + ssIncome;
      const agi = strategyIncomeTaxInfo.agi;
      const taxableIncome = strategyIncomeTaxInfo.taxableIncome;
      const federalTaxBracket = getMarginalBracket(taxableIncome, client.filing_status, year);
      const irmaaTier = irmaaTierFromLookback;

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
        federalTax: 0, // TAX-FREE (Roth GI)
        stateTax: 0,   // TAX-FREE (Roth GI)
        niitTax: 0,
        irmaaSurcharge,
        totalTax: irmaaSurcharge,
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
        federalTaxOnSS: 0,
        federalTaxOnConversions: 0,
        federalTaxOnOrdinaryIncome: 0, // GI income is tax-free (Roth)
        stateTaxOnSS: 0,
        stateTaxOnConversions: 0,
        stateTaxOnOrdinaryIncome: 0,
        // GI-specific fields
        incomeRiderValue: incomeBaseAtIncomeAge,
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
        incomeBase: incomeBaseAtIncomeAge,
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
  const effectiveIncomeStartAge = strategyMetrics.incomeStartAge;
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
    const primaryYearsCollecting = age >= primarySsStartAge ? age - primarySsStartAge : -1;
    const primarySsIncome = primaryYearsCollecting >= 0
      ? Math.round(primarySsAmount * Math.pow(1 + ssiColaRate, primaryYearsCollecting))
      : 0;

    let spouseSsIncome = 0;
    if (client.filing_status === 'married_filing_jointly' && spouseSsAmount > 0) {
      const currentSpouseAge = initialSpouseAge !== null ? initialSpouseAge + yearOffset : 0;
      const spouseYearsCollecting = currentSpouseAge >= spouseSsStartAge ? currentSpouseAge - spouseSsStartAge : -1;
      spouseSsIncome = spouseYearsCollecting >= 0
        ? Math.round(spouseSsAmount * Math.pow(1 + ssiColaRate, spouseYearsCollecting))
        : 0;
    }
    const ssIncome = primarySsIncome + spouseSsIncome;
    const otherIncome = getNonSSIIncomeForYear(client, year);
    const taxExemptNonSSI = getTaxExemptIncomeForYear(client, year);

    // --- Standard deduction ---
    const deductions = getStandardDeduction(client.filing_status, age, spouseAge ?? undefined, year);
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

      // Taxable account grows
      const taxableInterest = Math.round(boyTaxable * rateOfReturn);
      taxableBalance = boyTaxable + taxableInterest;

      // IRMAA. Voluntary IRA pulls feed into MAGI/income exactly like ordinary income.
      const magi = otherIncome + iraWithdrawalW + taxExemptNonSSI + ssIncome;
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
      const waitingTaxInfo = computeTaxableIncomeWithSS({
        otherIncome: otherIncome + iraWithdrawalW,
        ssBenefits: ssIncome,
        taxExemptInterest: taxExemptNonSSI,
        deductions,
        filingStatus: client.filing_status,
      });
      const totalIncome = otherIncome + iraWithdrawalW + ssIncome;
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
        totalTax: irmaaSurcharge + earlyPenaltyW,
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
          if (rollUpInfo.type === 'simple') {
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
      const baselineDeferralTaxInfo = computeTaxableIncomeWithSS({
        otherIncome,
        ssBenefits: ssIncome,
        taxExemptInterest: taxExemptNonSSI,
        deductions,
        filingStatus: client.filing_status,
      });
      const totalIncome = otherIncome + ssIncome;
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

      // For "increasing" LPA option, apply annual increase after first year
      const yearsOfIncome = age - effectiveIncomeStartAge;
      let grossGI = guaranteedAnnualIncome;
      if (payoutOption === 'increasing' && yearsOfIncome > 0) {
        const increaseRate = getEffectiveIncreasingLPARate(productId, customProduct);
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
        const feeBase = riderFeeAppliesTo === 'accountValue' ? accountValue : incomeBaseAtIncomeAge;
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
        incomeRiderValue: incomeBaseAtIncomeAge,
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
        incomeBase: incomeBaseAtIncomeAge,
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
