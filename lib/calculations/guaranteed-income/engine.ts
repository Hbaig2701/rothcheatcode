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
  calculateOptimalConversion,
  calculateConversionFederalTax,
} from '../modules/federal-tax';
import { calculateStateTax, calculateConversionStateTax } from '../modules/state-tax';
import { calculateIRMAAWithLookback } from '../modules/irmaa';
import { getStandardDeduction } from '@/lib/data/standard-deductions';
import { getStateTaxRate } from '@/lib/data/states';
import {
  GI_PRODUCT_DATA,
  getProductPayoutFactor,
  getRollUpForYear,
  type GIProductData,
} from '@/lib/config/gi-product-data';
import type { GuaranteedIncomeFormulaType } from '@/lib/config/products';

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
  const { client, startYear, endYear } = input;
  const projectionYears = endYear - startYear + 1;

  // Run STRATEGY: Convert First, Then Roth GI (tax-free income)
  const { formula, strategyMetrics, strategyGIYearlyData } = runGIStrategyScenario(
    client,
    startYear,
    projectionYears
  );

  // Run BASELINE: Traditional GI (taxable income)
  const { baseline, baselineMetrics, baselineGIYearlyData } = runGIBaselineScenario(
    client,
    startYear,
    projectionYears,
    strategyMetrics
  );

  // Calculate comparison metrics
  const comparison = calculateComparisonMetrics(strategyMetrics, baselineMetrics);

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
  projectionYears: number
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

  // --- Product config ---
  const productId = client.blueprint_type as GuaranteedIncomeFormulaType;
  const productData: GIProductData | undefined = GI_PRODUCT_DATA[productId];

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
  const useSpouseAgeBased = client.spouse_age !== undefined && client.spouse_age !== null && client.spouse_age > 0;
  const initialSpouseAge = useSpouseAgeBased ? client.spouse_age! : null;
  const ssiColaRate = 0.02;

  // --- Other income ---
  const grossTaxableNonSSI = client.gross_taxable_non_ssi ?? 500000;
  const taxExemptNonSSI = client.tax_exempt_non_ssi ?? 0;

  // --- Rider fee config ---
  const riderFeeRate = productData ? productData.riderFee / 100 : 0;
  const riderFeeAppliesTo = productData?.riderFeeAppliesTo ?? 'incomeBase';

  // --- Initial values ---
  let traditionalBalance = client.qualified_account_value ?? 0;
  let rothBalance = client.roth_ira ?? 0;
  let taxableBalance = client.taxable_accounts ?? 0;

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
    const spouseAge = client.spouse_dob ? calculateAge(client.spouse_dob, year) : null;

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
    const otherIncome = grossTaxableNonSSI;

    // --- Standard deduction ---
    const deductions = getStandardDeduction(client.filing_status, age, spouseAge ?? undefined, year);
    const existingTaxableIncome = calculateTaxableIncome(otherIncome, deductions);

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

      if (boyTraditional > 0) {
        // Calculate optimal conversion that fills up to target bracket
        conversionAmount = calculateOptimalConversion(
          boyTraditional,
          existingTaxableIncome,
          conversionBracket,
          client.filing_status,
          year
        );

        // Handle tax payment from IRA
        if (payTaxFromIRA && conversionAmount > 0) {
          const effectiveRate = conversionBracket / 100 + stateTaxRateDecimal;
          conversionAmount = Math.round(conversionAmount * (1 - effectiveRate));
          conversionAmount = Math.min(conversionAmount, boyTraditional);
        }

        // Calculate conversion tax
        if (conversionAmount > 0) {
          federalConversionTax = calculateConversionFederalTax(
            conversionAmount,
            existingTaxableIncome,
            client.filing_status,
            year
          );
          stateConversionTax = calculateConversionStateTax(
            conversionAmount,
            client.state,
            stateTaxRateDecimal
          );
        }
      }

      const conversionTax = federalConversionTax + stateConversionTax;
      totalConversionTax += conversionTax;

      // Execute conversion
      traditionalBalance = boyTraditional - conversionAmount;
      rothBalance = boyRoth + conversionAmount;

      // Apply growth
      const traditionalInterest = Math.round(traditionalBalance * rateOfReturn);
      const rothInterest = Math.round(rothBalance * rateOfReturn);
      const taxableInterest = Math.round(boyTaxable * rateOfReturn);

      traditionalBalance += traditionalInterest;
      rothBalance += rothInterest;

      // Handle tax payment
      if (payTaxFromIRA) {
        taxableBalance = boyTaxable + taxableInterest;
      } else {
        taxableBalance = boyTaxable + taxableInterest - conversionTax;
      }

      // IRMAA
      const grossIncomeWithConversion = otherIncome + conversionAmount;
      const magi = grossIncomeWithConversion + taxExemptNonSSI + ssIncome;
      incomeHistory.set(year, magi);

      let irmaaSurcharge = 0;
      if (age >= 65) {
        const irmaaResult = calculateIRMAAWithLookback(year, incomeHistory, client.filing_status);
        irmaaSurcharge = irmaaResult.annualSurcharge;
      }

      const totalTax = conversionTax + irmaaSurcharge;

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
        totalIncome: grossIncomeWithConversion + ssIncome,
        federalTax: federalConversionTax,
        stateTax: stateConversionTax,
        niitTax: 0,
        irmaaSurcharge,
        totalTax,
        taxableSS: 0,
        netWorth: traditionalBalance + rothBalance + taxableBalance,
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

        if (productData.bonusAppliesTo === 'accountValue') {
          // American Equity: bonus goes to both account value and income base
          accountValue = Math.round(purchaseAmount * (1 + bonusRate));
          incomeBase = Math.round(purchaseAmount * (1 + bonusRate));
          bonusAmount = Math.round(purchaseAmount * bonusRate);
        } else if (productData.bonusAppliesTo === 'incomeBase') {
          // Athene, EquiTrust: bonus goes to income base only
          accountValue = purchaseAmount;
          incomeBase = Math.round(purchaseAmount * (1 + bonusRate));
          bonusAmount = Math.round(purchaseAmount * bonusRate);
        } else {
          // North American: no bonus
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

      // Roth balance is now 0 (money moved into GI)
      rothBalance = 0;
      giPurchased = true;

      // No tax event on purchase (inside Roth)
      const taxableInterest = Math.round(boyTaxable * rateOfReturn);
      taxableBalance = boyTaxable + taxableInterest;

      // IRMAA tracking
      const magi = otherIncome + taxExemptNonSSI + ssIncome;
      incomeHistory.set(year, magi);

      let irmaaSurcharge = 0;
      if (age >= 65) {
        const irmaaResult = calculateIRMAAWithLookback(year, incomeHistory, client.filing_status);
        irmaaSurcharge = irmaaResult.annualSurcharge;
      }

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
        totalIncome: otherIncome + ssIncome,
        federalTax: 0,
        stateTax: 0,
        niitTax: 0,
        irmaaSurcharge,
        totalTax: irmaaSurcharge,
        taxableSS: 0,
        netWorth: accountValue + taxableBalance,
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
      if (productData) {
        const rollUpInfo = getRollUpForYear(productId, deferralYear, rollUpOption);
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
          ? getProductPayoutFactor(productId, payoutType, effectiveIncomeStartAge, payoutOption)
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

      let irmaaSurcharge = 0;
      if (age >= 65) {
        const irmaaResult = calculateIRMAAWithLookback(year, incomeHistory, client.filing_status);
        irmaaSurcharge = irmaaResult.annualSurcharge;
      }

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
        totalIncome: otherIncome + ssIncome,
        federalTax: 0,
        stateTax: 0,
        niitTax: 0,
        irmaaSurcharge,
        totalTax: irmaaSurcharge,
        taxableSS: 0,
        netWorth: accountValue + taxableBalance,
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
          ? getProductPayoutFactor(productId, payoutType, effectiveIncomeStartAge, payoutOption)
          : 0.05;
        payoutPercent = payoutFactor * 100;
        guaranteedAnnualIncome = Math.round(incomeBaseAtIncomeAge * payoutFactor);
      }

      const grossGI = guaranteedAnnualIncome;

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

      let irmaaSurcharge = 0;
      if (age >= 65) {
        const irmaaResult = calculateIRMAAWithLookback(year, incomeHistory, client.filing_status);
        irmaaSurcharge = irmaaResult.annualSurcharge;
      }

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
        totalIncome: grossGI + otherIncome + ssIncome,
        federalTax: 0, // TAX-FREE
        stateTax: 0,   // TAX-FREE
        niitTax: 0,
        irmaaSurcharge,
        totalTax: irmaaSurcharge,
        taxableSS: 0,
        netWorth: accountValue + taxableBalance,
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
  }
): {
  baseline: YearlyResult[];
  baselineMetrics: GIBaselineMetrics;
  baselineGIYearlyData: GIYearData[];
} {
  const results: YearlyResult[] = [];
  const giYearlyData: GIYearData[] = [];

  // --- Product config ---
  const productId = client.blueprint_type as GuaranteedIncomeFormulaType;
  const productData: GIProductData | undefined = GI_PRODUCT_DATA[productId];

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
  const useSpouseAgeBased = client.spouse_age !== undefined && client.spouse_age !== null && client.spouse_age > 0;
  const initialSpouseAge = useSpouseAgeBased ? client.spouse_age! : null;
  const ssiColaRate = 0.02;

  // --- Other income ---
  const grossTaxableNonSSI = client.gross_taxable_non_ssi ?? 500000;
  const taxExemptNonSSI = client.tax_exempt_non_ssi ?? 0;

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
    const spouseAge = client.spouse_dob ? calculateAge(client.spouse_dob, year) : null;

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
    const otherIncome = grossTaxableNonSSI;

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
      // Traditional IRA grows
      const iraGrowth = Math.round(traditionalBalance * rateOfReturn);
      traditionalBalance = traditionalBalance + iraGrowth;

      // Taxable account grows
      const taxableInterest = Math.round(boyTaxable * rateOfReturn);
      taxableBalance = boyTaxable + taxableInterest;

      // IRMAA
      const magi = otherIncome + taxExemptNonSSI + ssIncome;
      incomeHistory.set(year, magi);

      let irmaaSurcharge = 0;
      if (age >= 65) {
        const irmaaResult = calculateIRMAAWithLookback(year, incomeHistory, client.filing_status);
        irmaaSurcharge = irmaaResult.annualSurcharge;
      }

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
        totalIncome: otherIncome + ssIncome,
        federalTax: 0,
        stateTax: 0,
        niitTax: 0,
        irmaaSurcharge,
        totalTax: irmaaSurcharge,
        taxableSS: 0,
        netWorth: traditionalBalance + taxableBalance,
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

        if (productData.bonusAppliesTo === 'accountValue') {
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

      // Taxable account grows
      const taxableInterest = Math.round(boyTaxable * rateOfReturn);
      taxableBalance = boyTaxable + taxableInterest;

      // IRMAA
      const magi = otherIncome + taxExemptNonSSI + ssIncome;
      incomeHistory.set(year, magi);

      let irmaaSurcharge = 0;
      if (age >= 65) {
        const irmaaResult = calculateIRMAAWithLookback(year, incomeHistory, client.filing_status);
        irmaaSurcharge = irmaaResult.annualSurcharge;
      }

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
        totalIncome: otherIncome + ssIncome,
        federalTax: 0,
        stateTax: 0,
        niitTax: 0,
        irmaaSurcharge,
        totalTax: irmaaSurcharge,
        taxableSS: 0,
        netWorth: accountValue + taxableBalance,
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
      const deferralYear = age - purchaseAge; // Years since purchase

      // Roll up Income Base
      if (productData && deferralYear > 0) {
        const rollUpInfo = getRollUpForYear(productId, deferralYear, rollUpOption);
        if (rollUpInfo) {
          if (rollUpInfo.type === 'simple') {
            incomeBase = incomeBase + Math.round(originalIncomeBase * rollUpInfo.rate);
          } else {
            incomeBase = Math.round(incomeBase * (1 + rollUpInfo.rate));
          }
        }
      }

      // At the year BEFORE income starts, lock in income base and payout
      if (age + 1 === effectiveIncomeStartAge) {
        incomeBaseAtIncomeAge = incomeBase;
        const payoutFactor = productData
          ? getProductPayoutFactor(productId, payoutType, effectiveIncomeStartAge, payoutOption)
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

      let irmaaSurcharge = 0;
      if (age >= 65) {
        const irmaaResult = calculateIRMAAWithLookback(year, incomeHistory, client.filing_status);
        irmaaSurcharge = irmaaResult.annualSurcharge;
      }

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
        totalIncome: otherIncome + ssIncome,
        federalTax: 0,
        stateTax: 0,
        niitTax: 0,
        irmaaSurcharge,
        totalTax: irmaaSurcharge,
        taxableSS: 0,
        netWorth: accountValue + taxableBalance,
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
          ? getProductPayoutFactor(productId, payoutType, effectiveIncomeStartAge, payoutOption)
          : 0.05;
        payoutPercent = payoutFactor * 100;
        guaranteedAnnualIncome = Math.round(incomeBaseAtIncomeAge * payoutFactor);
      }

      const grossGI = guaranteedAnnualIncome;

      // TAXABLE because it's inside a Traditional IRA!
      const grossTaxableIncome = grossGI + otherIncome;
      const taxableIncome = calculateTaxableIncome(grossTaxableIncome, deductions);

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

      let irmaaSurcharge = 0;
      if (age >= 65) {
        const irmaaResult = calculateIRMAAWithLookback(year, incomeHistory, client.filing_status);
        irmaaSurcharge = irmaaResult.annualSurcharge;
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
        totalIncome: grossTaxableIncome + ssIncome,
        federalTax: federalResult.totalTax,
        stateTax: stateResult.totalTax,
        niitTax: 0,
        irmaaSurcharge,
        totalTax,
        taxableSS: 0,
        netWorth: accountValue + taxableBalance,
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
  baseline: GIBaselineMetrics
): GIComparisonMetrics {
  const annualAdvantage = strategy.annualIncomeNet - baseline.annualIncomeNet;
  const lifetimeAdvantage = strategy.lifetimeIncomeNet - baseline.lifetimeIncomeNet;

  // Break-even years = Conversion Tax / Annual Advantage
  const breakEvenYears = annualAdvantage > 0
    ? Math.ceil(strategy.totalConversionTax / annualAdvantage)
    : null;

  const breakEvenAge = breakEvenYears !== null
    ? strategy.incomeStartAge + breakEvenYears
    : null;

  const percentImprovement = baseline.lifetimeIncomeNet > 0
    ? (lifetimeAdvantage / baseline.lifetimeIncomeNet) * 100
    : 0;

  return {
    // Strategy (Roth GI)
    strategyAnnualIncomeGross: strategy.annualIncomeGross,
    strategyAnnualIncomeNet: strategy.annualIncomeNet, // Same as gross
    strategyLifetimeIncomeGross: strategy.lifetimeIncomeGross,
    strategyLifetimeIncomeNet: strategy.lifetimeIncomeNet,
    strategyTotalConversionTax: strategy.totalConversionTax,
    strategyIncomeBase: strategy.incomeBaseAtIncomeAge,

    // Baseline (Traditional GI)
    baselineAnnualIncomeGross: baseline.annualIncomeGross,
    baselineAnnualIncomeNet: baseline.annualIncomeNet,
    baselineLifetimeIncomeGross: baseline.lifetimeIncomeGross,
    baselineLifetimeIncomeNet: baseline.lifetimeIncomeNet,
    baselineAnnualTax: baseline.annualTax,
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
