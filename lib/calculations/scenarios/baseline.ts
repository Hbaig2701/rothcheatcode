import type { Client } from '@/lib/types/client';
import type { YearlyResult } from '../types';
import { calculateAge, getAgeAtYearOffset, getBirthYearFromAge } from '../utils/age';
import { calculateRMD } from '../modules/rmd';
import { calculateFederalTax, calculateTaxableIncome, determineTaxBracket } from '../modules/federal-tax';
import { calculateStateTax } from '../modules/state-tax';
import { calculateIRMAA, calculateIRMAAWithLookback } from '../modules/irmaa';
import { getStandardDeduction } from '@/lib/data/standard-deductions';

/**
 * Run Baseline scenario: no Roth conversions, just RMDs
 *
 * Per specification:
 * - Interest = (B.O.Y. Balance - Distribution) × Rate
 * - E.O.Y. Balance = B.O.Y. Balance - Distribution + Interest
 * - SSI is treated as tax-exempt (simplified model)
 * - IRMAA uses 2-year lookback
 *
 * RMD Treatment Options:
 * - 'spent': RMDs used for living expenses (not accumulated)
 * - 'reinvested': RMDs go to taxable account and earn interest (default)
 * - 'cash': RMDs accumulate in cash but don't earn interest
 *
 * Supports both legacy DOB-based approach and new age-based approach
 */
export function runBaselineScenario(
  client: Client,
  startYear: number,
  projectionYears: number
): YearlyResult[] {
  const results: YearlyResult[] = [];

  // Determine if using new age-based approach or legacy DOB approach
  const useAgeBased = client.age !== undefined && client.age > 0;
  const clientAge = useAgeBased ? client.age : (client.date_of_birth ? calculateAge(client.date_of_birth, startYear) : 62);
  const birthYear = useAgeBased
    ? getBirthYearFromAge(clientAge, startYear)
    : (client.date_of_birth ? new Date(client.date_of_birth).getFullYear() : startYear - clientAge);

  // Use baseline_comparison_rate for baseline scenario (spec default: 7%)
  const growthRate = (client.baseline_comparison_rate ?? client.growth_rate ?? 7) / 100;

  // Initial balance - Baseline does NOT apply insurance product bonus
  let iraBalance = client.qualified_account_value ?? client.traditional_ira ?? 0;
  let rothBalance = client.roth_ira ?? 0;
  let taxableBalance = client.taxable_accounts ?? 0;

  // Income history for IRMAA lookback
  const incomeHistory = new Map<number, number>();

  // SSI parameters (simplified: SSI treated as tax-exempt per spec)
  // Primary SSI
  const primarySsStartAge = client.ssi_payout_age ?? client.ss_start_age ?? 67;
  const primarySsAmount = client.ssi_annual_amount ?? client.ss_self ?? 0;

  // Spouse SSI (MFJ only)
  const spouseSsStartAge = client.spouse_ssi_payout_age ?? 67;
  const spouseSsAmount = client.spouse_ssi_annual_amount ?? client.ss_spouse ?? 0;

  // Spouse age tracking
  const useSpouseAgeBased = client.spouse_age !== undefined && client.spouse_age !== null && client.spouse_age > 0;
  const initialSpouseAge = useSpouseAgeBased ? client.spouse_age! : null;

  const ssiColaRate = 0.02; // 2% annual COLA per spec

  // Non-SSI taxable income (annual)
  const grossTaxableNonSSI = client.gross_taxable_non_ssi ??
    (client.non_ssi_income?.[0]?.gross_taxable ?? client.other_income ?? 500000); // Default $5,000

  // Tax-exempt income (for MAGI calculation)
  const taxExemptNonSSI = client.tax_exempt_non_ssi ?? 0;

  // State tax rate override (convert from percentage to decimal, null if not set)
  const stateTaxRateOverride = client.state_tax_rate !== undefined && client.state_tax_rate !== null
    ? client.state_tax_rate / 100
    : undefined;

  // RMD treatment option (default to 'reinvested' for backwards compatibility)
  const rmdTreatment = client.rmd_treatment ?? 'reinvested';

  // Track cumulative after-tax distributions for 'spent' scenario
  let cumulativeAfterTaxDistributions = 0;

  for (let yearOffset = 0; yearOffset < projectionYears; yearOffset++) {
    const year = startYear + yearOffset;
    const age = useAgeBased ? getAgeAtYearOffset(clientAge, yearOffset) : calculateAge(client.date_of_birth!, year);
    const spouseAge = client.spouse_dob ? calculateAge(client.spouse_dob, year) : null;

    // Beginning of Year balances
    const boyIRA = iraBalance;
    const boyRoth = rothBalance;
    const boyTaxable = taxableBalance;

    // Calculate RMD based on prior year-end balance (which is current BOY)
    const rmdResult = calculateRMD({ age, traditionalBalance: boyIRA, birthYear });
    const rmdAmount = rmdResult.rmdAmount;

    // Primary SSI income (with COLA)
    const primaryYearsCollecting = age >= primarySsStartAge ? age - primarySsStartAge : -1;
    const primarySsIncome = primaryYearsCollecting >= 0
      ? Math.round(primarySsAmount * Math.pow(1 + ssiColaRate, primaryYearsCollecting))
      : 0;

    // Spouse SSI income (with COLA) - for MFJ
    let spouseSsIncome = 0;
    if (client.filing_status === 'married_filing_jointly' && spouseSsAmount > 0) {
      const currentSpouseAge = initialSpouseAge !== null ? initialSpouseAge + yearOffset : (spouseAge ?? 0);
      const spouseYearsCollecting = currentSpouseAge >= spouseSsStartAge ? currentSpouseAge - spouseSsStartAge : -1;
      spouseSsIncome = spouseYearsCollecting >= 0
        ? Math.round(spouseSsAmount * Math.pow(1 + ssiColaRate, spouseYearsCollecting))
        : 0;
    }

    const ssIncome = primarySsIncome + spouseSsIncome;

    // Other taxable income (non-SSI)
    const otherIncome = grossTaxableNonSSI;

    // Per specification: SSI is tax-exempt (simplified model)
    // Gross taxable income = RMD + non-SSI taxable income
    const grossTaxableIncome = rmdAmount + otherIncome;

    // Standard deduction (age-adjusted)
    const deductions = getStandardDeduction(client.filing_status, age, spouseAge ?? undefined, year);

    // Taxable income (cannot be negative)
    const taxableIncome = calculateTaxableIncome(grossTaxableIncome, deductions);

    // Federal tax
    const federalResult = calculateFederalTax({
      taxableIncome,
      filingStatus: client.filing_status,
      taxYear: year
    });

    // State tax (on taxable income)
    const stateResult = calculateStateTax({
      taxableIncome,
      state: client.state,
      filingStatus: client.filing_status,
      overrideRate: stateTaxRateOverride
    });

    // Calculate AGI and MAGI for IRMAA
    // AGI = Gross income - deductions (but for IRMAA we use full gross)
    // MAGI for IRMAA = AGI + Tax-Exempt Interest Income
    const agi = grossTaxableIncome;
    const magi = agi + taxExemptNonSSI + ssIncome; // Include SSI in MAGI for IRMAA

    // Store for IRMAA lookback
    incomeHistory.set(year, magi);

    // IRMAA (Medicare surcharge, age 65+ only, uses 2-year lookback)
    let irmaaSurcharge = 0;
    if (age >= 65) {
      const irmaaResult = calculateIRMAAWithLookback(year, incomeHistory, client.filing_status);
      irmaaSurcharge = irmaaResult.annualSurcharge;
    }

    // Total tax
    const totalTax = federalResult.totalTax + stateResult.totalTax + irmaaSurcharge;

    // Calculate interest AFTER distribution
    // Interest = (B.O.Y. Balance - Distribution) × Rate
    const iraAfterDistribution = boyIRA - rmdAmount;
    const iraInterest = Math.round(iraAfterDistribution * growthRate);
    const rothInterest = Math.round(boyRoth * growthRate);

    // Taxable interest only applies in 'reinvested' mode
    const taxableInterest = rmdTreatment === 'reinvested'
      ? Math.round(boyTaxable * growthRate)
      : 0;

    // End of Year balances
    // E.O.Y. = B.O.Y. - Distribution + Interest
    iraBalance = iraAfterDistribution + iraInterest;
    rothBalance = boyRoth + rothInterest;

    // Taxable balance handling depends on RMD treatment option
    // After-tax RMD = RMD - taxes attributable to the RMD
    const afterTaxRmd = rmdAmount - totalTax;

    if (rmdTreatment === 'spent') {
      // RMDs are spent on living expenses - don't accumulate in taxable
      // Track as distributions received (for Lifetime Wealth calculation)
      cumulativeAfterTaxDistributions += Math.max(0, afterTaxRmd);
      // Taxable balance stays flat (no RMDs added, but also no tax deducted since paid from RMD)
      taxableBalance = boyTaxable;
    } else if (rmdTreatment === 'cash') {
      // RMDs accumulate in cash but don't earn interest
      taxableBalance = boyTaxable + rmdAmount - totalTax;
    } else {
      // 'reinvested' (default): RMDs go to taxable account and earn interest
      taxableBalance = boyTaxable + rmdAmount + taxableInterest - totalTax;
    }

    // Determine tax bracket
    const bracket = determineTaxBracket(taxableIncome, client.filing_status, year);

    results.push({
      year,
      age,
      spouseAge,
      traditionalBalance: iraBalance,
      rothBalance,
      taxableBalance,
      rmdAmount,
      conversionAmount: 0, // No conversions in baseline
      ssIncome,
      pensionIncome: 0, // Simplified - included in otherIncome
      otherIncome,
      totalIncome: grossTaxableIncome + ssIncome,
      federalTax: federalResult.totalTax,
      stateTax: stateResult.totalTax,
      niitTax: 0, // Simplified - not included in basic model
      irmaaSurcharge,
      totalTax,
      taxableSS: 0, // SSI is tax-exempt per simplified model
      netWorth: iraBalance + rothBalance + taxableBalance,
      cumulativeDistributions: rmdTreatment === 'spent' ? cumulativeAfterTaxDistributions : undefined
    });
  }

  return results;
}

/**
 * Calculate the annual interest on an account
 * Per specification: Interest = (B.O.Y. Balance - Distribution) × Rate
 */
export function calculateAnnualInterest(
  beginningBalance: number,
  distribution: number,
  rateOfReturn: number
): number {
  const balanceAfterDistribution = beginningBalance - distribution;
  return Math.round(balanceAfterDistribution * rateOfReturn);
}

/**
 * Calculate end of year balance
 * Per specification: E.O.Y. = B.O.Y. - Distribution + Interest
 */
export function calculateEndOfYearBalance(
  beginningBalance: number,
  distribution: number,
  interest: number
): number {
  return beginningBalance - distribution + interest;
}
