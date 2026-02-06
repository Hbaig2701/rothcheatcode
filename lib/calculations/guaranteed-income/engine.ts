/**
 * Guaranteed Income Calculation Engine
 *
 * This is a SEPARATE engine from the Growth engine. It does NOT modify
 * any existing Growth calculation files.
 *
 * Key differences from Growth:
 * - Tracks two parallel values: Account Value and Income Base
 * - Bonus routing is product-specific (incomeBase, accountValue, or none)
 * - Income Base grows via product-specific roll-up (simple/compound, tiered)
 * - Rider fee deducted from Account Value annually
 * - Payout percentages looked up from product-specific tables by age
 * - Income continues even after Account Value depletes to $0
 * - Conversions only during deferral period (before income starts)
 * - Baseline uses systematic withdrawals matching GI amount for fair comparison
 *
 * All monetary values are in cents (integers).
 */

import type { Client } from '@/lib/types/client';
import type { SimulationInput, SimulationResult, YearlyResult } from '../types';
import type { GIMetrics, GIYearData } from './types';
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
// Break-even / Tax savings / Heir benefit (same formulas as Growth engine)
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

  // Run both scenarios
  const { formula, giMetrics } = runGIFormulaScenario(client, startYear, projectionYears);
  const baseline = runGIBaselineScenario(client, startYear, projectionYears, giMetrics.annualIncomeGross, giMetrics.incomeStartAge);

  return {
    baseline,
    formula,
    breakEvenAge: calculateBreakEvenAge(baseline, formula),
    totalTaxSavings: calculateTaxSavings(baseline, formula),
    heirBenefit: calculateHeirBenefit(baseline, formula, client.heir_tax_rate ?? 40),
    giMetrics,
  };
}

// ---------------------------------------------------------------------------
// GI Formula Scenario
// ---------------------------------------------------------------------------

function runGIFormulaScenario(
  client: Client,
  startYear: number,
  projectionYears: number
): { formula: YearlyResult[]; giMetrics: GIMetrics } {
  const results: YearlyResult[] = [];
  const giYearlyData: GIYearData[] = [];

  // --- Product config ---
  const productId = client.blueprint_type as GuaranteedIncomeFormulaType;
  const productData: GIProductData | undefined = GI_PRODUCT_DATA[productId];

  // --- Age setup ---
  const useAgeBased = client.age !== undefined && client.age > 0;
  const clientAge = useAgeBased ? client.age : 62;

  // --- Rates ---
  const rateOfReturn = (client.rate_of_return ?? 0) / 100;

  // --- Initial values ---
  const initialQualifiedValue = client.qualified_account_value ?? client.traditional_ira ?? 0;
  const bonusRate = (client.bonus_percent ?? 0) / 100;

  // --- Product-specific initialization ---
  let accountValue: number;
  let incomeBase: number;
  let bonusAmount = 0;
  let bonusAppliesTo: string | null = null;

  if (productData) {
    const bonus = bonusRate;
    bonusAppliesTo = productData.bonusAppliesTo;

    if (productData.bonusAppliesTo === 'accountValue') {
      // American Equity: bonus goes to real money + income base
      accountValue = Math.round(initialQualifiedValue * (1 + bonus));
      incomeBase = Math.round(initialQualifiedValue * (1 + bonus));
      bonusAmount = Math.round(initialQualifiedValue * bonus);
    } else if (productData.bonusAppliesTo === 'incomeBase') {
      // Athene, EquiTrust: bonus goes to income base only
      accountValue = initialQualifiedValue;
      incomeBase = Math.round(initialQualifiedValue * (1 + bonus));
      bonusAmount = Math.round(initialQualifiedValue * bonus);
    } else {
      // North American: no bonus
      accountValue = initialQualifiedValue;
      incomeBase = initialQualifiedValue;
    }
  } else {
    // Fallback for unknown products
    accountValue = Math.round(initialQualifiedValue * (1 + bonusRate));
    incomeBase = accountValue;
    bonusAmount = Math.round(initialQualifiedValue * bonusRate);
  }

  const incomeBaseAtStart = incomeBase;
  const originalIncomeBase = incomeBase; // Needed for simple interest roll-up

  let rothBalance = client.roth_ira ?? 0;
  let taxableBalance = client.taxable_accounts ?? 0;

  // --- GI timing ---
  const effectiveIncomeStartAge = Math.max(client.income_start_age ?? 65, clientAge);
  const payoutType = client.payout_type ?? 'individual';
  const payoutOption = client.payout_option ?? 'level';
  const rollUpOption = client.roll_up_option ?? null;

  // --- Rider fee config ---
  const riderFeeRate = productData ? productData.riderFee / 100 : 0;
  const riderFeeAppliesTo = productData?.riderFeeAppliesTo ?? 'incomeBase';

  // --- Tax config ---
  const maxTaxRate = client.max_tax_rate ?? 24;
  const stateTaxRateDecimal = client.state_tax_rate !== undefined && client.state_tax_rate !== null
    ? client.state_tax_rate / 100
    : getStateTaxRate(client.state);
  const payTaxFromIRA = client.tax_payment_source === 'from_ira';

  // --- Conversion timing ---
  const yearsToDefer = client.years_to_defer_conversion ?? 0;
  const conversionStartAge = clientAge + yearsToDefer;

  // --- SSI config ---
  const primarySsStartAge = client.ssi_payout_age ?? client.ss_start_age ?? 67;
  const primarySsAmount = client.ssi_annual_amount ?? client.ss_self ?? 0;
  const spouseSsStartAge = client.spouse_ssi_payout_age ?? 67;
  const spouseSsAmount = client.spouse_ssi_annual_amount ?? client.ss_spouse ?? 0;
  const useSpouseAgeBased = client.spouse_age !== undefined && client.spouse_age !== null && client.spouse_age > 0;
  const initialSpouseAge = useSpouseAgeBased ? client.spouse_age! : null;
  const ssiColaRate = 0.02;

  // --- Other income ---
  const grossTaxableNonSSI = client.gross_taxable_non_ssi ??
    (client.non_ssi_income?.[0]?.gross_taxable ?? client.other_income ?? 500000);
  const taxExemptNonSSI = client.tax_exempt_non_ssi ?? 0;

  // --- Tracking ---
  const incomeHistory = new Map<number, number>();
  let conversionComplete = false;
  let depletionAge: number | null = null;
  let incomeBaseAtIncomeAge = incomeBase;
  let guaranteedAnnualIncome = 0;
  let totalGrossPaid = 0;
  let totalNetPaid = 0;
  let firstYearNetIncome = 0;
  let totalRiderFees = 0;
  let payoutPercent = 0;

  // --- Roll-up description ---
  const rollUpDescription = productData?.rollUpDescription ?? '';

  for (let yearOffset = 0; yearOffset < projectionYears; yearOffset++) {
    const year = startYear + yearOffset;
    const age = useAgeBased ? getAgeAtYearOffset(clientAge, yearOffset) : calculateAge(client.date_of_birth!, year);
    const spouseAge = client.spouse_dob ? calculateAge(client.spouse_dob, year) : null;

    const isDeferralPhase = age < effectiveIncomeStartAge;
    const boyAccount = accountValue;
    const boyRoth = rothBalance;
    const boyTaxable = taxableBalance;

    // --- SSI income ---
    const primaryYearsCollecting = age >= primarySsStartAge ? age - primarySsStartAge : -1;
    const primarySsIncome = primaryYearsCollecting >= 0
      ? Math.round(primarySsAmount * Math.pow(1 + ssiColaRate, primaryYearsCollecting))
      : 0;

    let spouseSsIncome = 0;
    if (client.filing_status === 'married_filing_jointly' && spouseSsAmount > 0) {
      const currentSpouseAge = initialSpouseAge !== null ? initialSpouseAge + yearOffset : (spouseAge ?? 0);
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

    // =======================================================================
    // DEFERRAL PHASE: Conversions happen, Income Base rolls up, rider fee
    // =======================================================================
    if (isDeferralPhase) {
      const deferralYear = yearOffset + 1; // 1-indexed for roll-up tier lookup

      // Roll up Income Base using product-specific config
      if (productData) {
        const rollUpInfo = getRollUpForYear(productId, deferralYear, rollUpOption);
        if (rollUpInfo) {
          if (rollUpInfo.type === 'simple') {
            // Simple interest: add percentage of ORIGINAL income base
            incomeBase = incomeBase + Math.round(originalIncomeBase * rollUpInfo.rate);
          } else {
            // Compound interest: multiply current income base
            incomeBase = Math.round(incomeBase * (1 + rollUpInfo.rate));
          }
        }
      } else {
        // Fallback: use guaranteed_rate_of_return
        const guaranteedRateOfReturn = (client.guaranteed_rate_of_return ?? 0) / 100;
        incomeBase = Math.round(incomeBase * (1 + guaranteedRateOfReturn));
      }

      // At the year BEFORE income starts, lock in the income base
      if (age + 1 === effectiveIncomeStartAge) {
        incomeBaseAtIncomeAge = incomeBase;
        const payoutFactor = productData
          ? getProductPayoutFactor(productId, payoutType, effectiveIncomeStartAge, payoutOption)
          : 0.05;
        payoutPercent = payoutFactor * 100;
        guaranteedAnnualIncome = Math.round(incomeBaseAtIncomeAge * payoutFactor);
      }

      // --- Roth conversions ---
      let conversionAmount = 0;
      let conversionTax = 0;
      let federalConversionTax = 0;
      let stateConversionTax = 0;

      const shouldConvert = !conversionComplete &&
        age >= conversionStartAge &&
        boyAccount > 0;

      if (shouldConvert) {
        conversionAmount = calculateOptimalConversion(
          boyAccount,
          existingTaxableIncome,
          maxTaxRate,
          client.filing_status,
          year
        );

        if (payTaxFromIRA && conversionAmount > 0) {
          const effectiveRate = maxTaxRate / 100 + stateTaxRateDecimal;
          conversionAmount = Math.round(conversionAmount * (1 - effectiveRate));
          conversionAmount = Math.min(conversionAmount, boyAccount);
        }

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
          conversionTax = federalConversionTax + stateConversionTax;
        }

        if (boyAccount - conversionAmount <= 0) {
          conversionComplete = true;
        }
      }

      // Execute conversion
      const accountAfterConversion = boyAccount - conversionAmount;
      const rothAfterConversion = boyRoth + conversionAmount;

      // Account value grows by Rate of Return
      const accountInterest = Math.round(accountAfterConversion * rateOfReturn);
      let accountAfterGrowth = accountAfterConversion + accountInterest;

      // Deduct rider fee from Account Value
      let yearRiderFee = 0;
      if (riderFeeRate > 0) {
        const feeBase = riderFeeAppliesTo === 'accountValue' ? accountAfterGrowth : incomeBase;
        yearRiderFee = Math.round(feeBase * riderFeeRate);
        accountAfterGrowth = Math.max(0, accountAfterGrowth - yearRiderFee);
        totalRiderFees += yearRiderFee;
      }

      const rothInterest = Math.round(rothAfterConversion * rateOfReturn);
      const taxableInterest = Math.round(boyTaxable * rateOfReturn);

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

      // EOY balances
      accountValue = accountAfterGrowth;
      rothBalance = rothAfterConversion + rothInterest;

      if (payTaxFromIRA) {
        taxableBalance = boyTaxable + taxableInterest;
      } else {
        taxableBalance = boyTaxable + taxableInterest - totalTax;
      }

      results.push({
        year, age, spouseAge,
        traditionalBalance: accountValue,
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
        netWorth: accountValue + rothBalance + taxableBalance,
      });

      giYearlyData.push({
        year, age,
        phase: 'deferral',
        accountValue,
        incomeBase,
        guaranteedIncomeGross: 0,
        guaranteedIncomeNet: 0,
        conversionAmount,
        riderFee: yearRiderFee,
      });

    // =======================================================================
    // INCOME PHASE: Guaranteed income paid out, no conversions
    // =======================================================================
    } else {
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

      // Gross taxable income = GI payment + other income
      const grossTaxableIncome = grossGI + otherIncome;
      const taxableIncome = calculateTaxableIncome(grossTaxableIncome, deductions);

      // Federal tax on total income
      const federalResult = calculateFederalTax({
        taxableIncome,
        filingStatus: client.filing_status,
        taxYear: year,
      });

      // State tax
      const stateResult = calculateStateTax({
        taxableIncome,
        state: client.state,
        filingStatus: client.filing_status,
        overrideRate: stateTaxRateDecimal,
      });

      // IRMAA
      const magi = grossTaxableIncome + taxExemptNonSSI + ssIncome;
      incomeHistory.set(year, magi);

      let irmaaSurcharge = 0;
      if (age >= 65) {
        const irmaaResult = calculateIRMAAWithLookback(year, incomeHistory, client.filing_status);
        irmaaSurcharge = irmaaResult.annualSurcharge;
      }

      const totalTax = federalResult.totalTax + stateResult.totalTax + irmaaSurcharge;
      const netGI = grossGI - federalResult.totalTax - stateResult.totalTax;

      // Track first year net income for the metrics
      if (totalGrossPaid === 0) {
        firstYearNetIncome = netGI;
      }

      totalGrossPaid += grossGI;
      totalNetPaid += netGI;

      // Deduct GI payment from account value
      accountValue = boyAccount - grossGI;

      // Account value floors at $0, but income keeps paying
      if (accountValue < 0) {
        if (depletionAge === null) {
          depletionAge = age;
        }
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

      const rothInterest = Math.round(boyRoth * rateOfReturn);
      const taxableInterest = Math.round(boyTaxable * rateOfReturn);

      rothBalance = boyRoth + rothInterest;
      // Taxable account receives after-tax GI income (grossGI - taxes)
      taxableBalance = boyTaxable + grossGI + taxableInterest - totalTax;

      results.push({
        year, age, spouseAge,
        traditionalBalance: accountValue,
        rothBalance,
        taxableBalance,
        rmdAmount: grossGI, // Map GI payment to rmdAmount for chart compatibility
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
        netWorth: accountValue + rothBalance + taxableBalance,
      });

      giYearlyData.push({
        year, age,
        phase: 'income',
        accountValue,
        incomeBase: incomeBaseAtIncomeAge,
        guaranteedIncomeGross: grossGI,
        guaranteedIncomeNet: netGI,
        conversionAmount: 0,
        riderFee: yearRiderFee,
      });
    }
  }

  const giMetrics: GIMetrics = {
    annualIncomeGross: guaranteedAnnualIncome,
    annualIncomeNet: firstYearNetIncome,
    incomeStartAge: effectiveIncomeStartAge,
    depletionAge,
    incomeBaseAtStart,
    incomeBaseAtIncomeAge,
    totalGrossPaid,
    totalNetPaid,
    yearlyData: giYearlyData,
    totalRiderFees,
    payoutPercent,
    rollUpDescription,
    bonusAmount,
    bonusAppliesTo,
  };

  return { formula: results, giMetrics };
}

// ---------------------------------------------------------------------------
// GI Baseline Scenario: Systematic withdrawals matching GI amount
// ---------------------------------------------------------------------------

function runGIBaselineScenario(
  client: Client,
  startYear: number,
  projectionYears: number,
  giAnnualIncome: number,
  giIncomeStartAge: number
): YearlyResult[] {
  const results: YearlyResult[] = [];

  const useAgeBased = client.age !== undefined && client.age > 0;
  const clientAge = useAgeBased ? client.age : 62;

  // Baseline uses baseline_comparison_rate
  const growthRate = (client.baseline_comparison_rate ?? 7) / 100;

  // Baseline does NOT apply bonus (fair comparison = same starting balance without product)
  let iraBalance = client.qualified_account_value ?? client.traditional_ira ?? 0;
  let rothBalance = client.roth_ira ?? 0;
  let taxableBalance = client.taxable_accounts ?? 0;

  const incomeHistory = new Map<number, number>();

  // SSI
  const primarySsStartAge = client.ssi_payout_age ?? client.ss_start_age ?? 67;
  const primarySsAmount = client.ssi_annual_amount ?? client.ss_self ?? 0;
  const spouseSsStartAge = client.spouse_ssi_payout_age ?? 67;
  const spouseSsAmount = client.spouse_ssi_annual_amount ?? client.ss_spouse ?? 0;
  const useSpouseAgeBased = client.spouse_age !== undefined && client.spouse_age !== null && client.spouse_age > 0;
  const initialSpouseAge = useSpouseAgeBased ? client.spouse_age! : null;
  const ssiColaRate = 0.02;

  const grossTaxableNonSSI = client.gross_taxable_non_ssi ??
    (client.non_ssi_income?.[0]?.gross_taxable ?? client.other_income ?? 500000);
  const taxExemptNonSSI = client.tax_exempt_non_ssi ?? 0;

  const stateTaxRateOverride = client.state_tax_rate !== undefined && client.state_tax_rate !== null
    ? client.state_tax_rate / 100
    : undefined;

  for (let yearOffset = 0; yearOffset < projectionYears; yearOffset++) {
    const year = startYear + yearOffset;
    const age = useAgeBased ? getAgeAtYearOffset(clientAge, yearOffset) : calculateAge(client.date_of_birth!, year);
    const spouseAge = client.spouse_dob ? calculateAge(client.spouse_dob, year) : null;

    const boyIRA = iraBalance;
    const boyRoth = rothBalance;
    const boyTaxable = taxableBalance;

    // SSI
    const primaryYearsCollecting = age >= primarySsStartAge ? age - primarySsStartAge : -1;
    const primarySsIncome = primaryYearsCollecting >= 0
      ? Math.round(primarySsAmount * Math.pow(1 + ssiColaRate, primaryYearsCollecting))
      : 0;

    let spouseSsIncome = 0;
    if (client.filing_status === 'married_filing_jointly' && spouseSsAmount > 0) {
      const currentSpouseAge = initialSpouseAge !== null ? initialSpouseAge + yearOffset : (spouseAge ?? 0);
      const spouseYearsCollecting = currentSpouseAge >= spouseSsStartAge ? currentSpouseAge - spouseSsStartAge : -1;
      spouseSsIncome = spouseYearsCollecting >= 0
        ? Math.round(spouseSsAmount * Math.pow(1 + ssiColaRate, spouseYearsCollecting))
        : 0;
    }
    const ssIncome = primarySsIncome + spouseSsIncome;
    const otherIncome = grossTaxableNonSSI;

    // Systematic withdrawal: match GI amount starting at same age
    let withdrawalAmount = 0;
    if (age >= giIncomeStartAge && boyIRA > 0) {
      withdrawalAmount = Math.min(giAnnualIncome, boyIRA);
    }

    const grossTaxableIncome = withdrawalAmount + otherIncome;
    const deductions = getStandardDeduction(client.filing_status, age, spouseAge ?? undefined, year);
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
      overrideRate: stateTaxRateOverride,
    });

    const agi = grossTaxableIncome;
    const magi = agi + taxExemptNonSSI + ssIncome;
    incomeHistory.set(year, magi);

    let irmaaSurcharge = 0;
    if (age >= 65) {
      const irmaaResult = calculateIRMAAWithLookback(year, incomeHistory, client.filing_status);
      irmaaSurcharge = irmaaResult.annualSurcharge;
    }

    const totalTax = federalResult.totalTax + stateResult.totalTax + irmaaSurcharge;

    // Interest after withdrawal
    const iraAfterWithdrawal = boyIRA - withdrawalAmount;
    const iraInterest = Math.round(iraAfterWithdrawal * growthRate);
    const rothInterest = Math.round(boyRoth * growthRate);
    const taxableInterest = Math.round(boyTaxable * growthRate);

    iraBalance = iraAfterWithdrawal + iraInterest;
    rothBalance = boyRoth + rothInterest;
    // Taxable account receives withdrawal proceeds, pays taxes, earns interest
    taxableBalance = boyTaxable + withdrawalAmount + taxableInterest - totalTax;

    results.push({
      year, age, spouseAge,
      traditionalBalance: iraBalance,
      rothBalance,
      taxableBalance,
      rmdAmount: withdrawalAmount,
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
      netWorth: iraBalance + rothBalance + taxableBalance,
    });
  }

  return results;
}
