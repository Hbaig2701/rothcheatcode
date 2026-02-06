import type { Client } from '@/lib/types/client';
import type { YearlyResult } from '../types';
import { calculateAge, getAgeAtYearOffset, getBirthYearFromAge } from '../utils/age';
import { calculateRMD } from '../modules/rmd';
import {
  calculateFederalTax,
  calculateTaxableIncome,
  calculateOptimalConversion,
  calculateConversionFederalTax,
  determineTaxBracket
} from '../modules/federal-tax';
import { calculateStateTax, calculateConversionStateTax } from '../modules/state-tax';
import { calculateIRMAAWithLookback, calculateIRMAAHeadroom } from '../modules/irmaa';
import { getStandardDeduction } from '@/lib/data/standard-deductions';
import { getStateTaxRate } from '@/lib/data/states';

/**
 * Run Formula scenario: strategic Roth conversions
 *
 * Per specification:
 * - Initial value = qualified_account_value × (1 + bonus_rate)
 * - Optimal conversion fills up to target bracket ceiling
 * - Interest = (B.O.Y. Balance - Distribution) × Rate
 * - Conversion tax = federal marginal tax + (conversion × state_rate)
 * - SSI is treated as tax-exempt (simplified model)
 * - IRMAA uses 2-year lookback
 *
 * Supports both legacy DOB-based approach and new age-based approach
 */
export function runFormulaScenario(
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

  // Use rate_of_return for formula scenario (spec default: 7%)
  const growthRate = (client.rate_of_return ?? client.growth_rate ?? 7) / 100;

  // Initial qualified account value
  const initialQualifiedValue = client.qualified_account_value ?? client.traditional_ira ?? 0;

  // Apply insurance product bonus
  // Per specification: formula_initial_value = qualified_account_value × (1 + bonus_rate)
  const bonusRate = (client.bonus_percent ?? 10) / 100;
  let iraBalance = Math.round(initialQualifiedValue * (1 + bonusRate));

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

  // Target bracket for conversions (default 24%)
  const maxTaxRate = client.max_tax_rate ?? 24;

  // State tax rate (as decimal for conversion tax calculation)
  const stateTaxRateDecimal = client.state_tax_rate !== undefined && client.state_tax_rate !== null
    ? client.state_tax_rate / 100
    : getStateTaxRate(client.state);

  // Conversion timing
  const yearsToDefer = client.years_to_defer_conversion ?? 0;
  const conversionStartAge = clientAge + yearsToDefer;
  const conversionEndAge = client.end_age ?? 100; // Convert until end of projection

  // Tax payment source
  const payTaxFromIRA = client.tax_payment_source === 'from_ira';

  // Track conversion completion
  let conversionComplete = false;

  for (let yearOffset = 0; yearOffset < projectionYears; yearOffset++) {
    const year = startYear + yearOffset;
    const age = useAgeBased ? getAgeAtYearOffset(clientAge, yearOffset) : calculateAge(client.date_of_birth!, year);
    const spouseAge = client.spouse_dob ? calculateAge(client.spouse_dob, year) : null;

    // Beginning of Year balances
    const boyIRA = iraBalance;
    const boyRoth = rothBalance;
    const boyTaxable = taxableBalance;
    const boyCombined = boyIRA + boyRoth;

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

    // Standard deduction (age-adjusted)
    const deductions = getStandardDeduction(client.filing_status, age, spouseAge ?? undefined, year);

    // Calculate existing taxable income (without conversion)
    // Per specification: SSI is tax-exempt, so only non-SSI income
    const existingGrossIncome = otherIncome;
    const existingTaxableIncome = calculateTaxableIncome(existingGrossIncome, deductions);

    // Determine conversion amount
    let conversionAmount = 0;
    let conversionTax = 0;
    let federalConversionTax = 0;
    let stateConversionTax = 0;

    // Check if we should convert this year
    const shouldConvert = !conversionComplete &&
                          age >= conversionStartAge &&
                          age <= conversionEndAge &&
                          boyIRA > 0;

    if (shouldConvert) {
      // Calculate optimal conversion that fills up to target bracket
      conversionAmount = calculateOptimalConversion(
        boyIRA,
        existingTaxableIncome,
        maxTaxRate,
        client.filing_status,
        year
      );

      // Handle tax payment from IRA (gross-up)
      if (payTaxFromIRA && conversionAmount > 0) {
        // Reduce conversion to account for tax that will be paid from IRA
        const effectiveRate = maxTaxRate / 100 + stateTaxRateDecimal;
        conversionAmount = Math.round(conversionAmount * (1 - effectiveRate));
        conversionAmount = Math.min(conversionAmount, boyIRA);
      }

      // Calculate conversion tax if we're converting
      if (conversionAmount > 0) {
        // Federal tax on conversion (marginal)
        federalConversionTax = calculateConversionFederalTax(
          conversionAmount,
          existingTaxableIncome,
          client.filing_status,
          year
        );

        // State tax on conversion (flat rate per spec)
        stateConversionTax = calculateConversionStateTax(
          conversionAmount,
          client.state,
          stateTaxRateDecimal
        );

        conversionTax = federalConversionTax + stateConversionTax;
      }

      // Check if conversion is complete
      if (boyIRA - conversionAmount <= 0) {
        conversionComplete = true;
      }
    }

    // Execute conversion
    const iraAfterConversion = boyIRA - conversionAmount;
    const rothAfterConversion = boyRoth + conversionAmount;

    // Calculate interest AFTER conversion
    // Per specification: Interest = (B.O.Y. Balance - Distribution) × Rate
    // For formula, the "distribution" is the conversion
    const iraInterest = Math.round(iraAfterConversion * growthRate);
    const rothInterest = Math.round(rothAfterConversion * growthRate);
    // NOTE: taxable balance does NOT earn interest - it represents taxes paid from external funds
    // A negative balance (taxes paid) should NOT compound as debt

    // Calculate MAGI for IRMAA
    // Include conversion in income for IRMAA purposes
    const grossIncomeWithConversion = existingGrossIncome + conversionAmount;
    const magi = grossIncomeWithConversion + taxExemptNonSSI + ssIncome;

    // Store for IRMAA lookback
    incomeHistory.set(year, magi);

    // IRMAA (Medicare surcharge, age 65+ only, uses 2-year lookback)
    let irmaaSurcharge = 0;
    if (age >= 65) {
      const irmaaResult = calculateIRMAAWithLookback(year, incomeHistory, client.filing_status);
      irmaaSurcharge = irmaaResult.annualSurcharge;
    }

    // Calculate tax on existing income (not conversion)
    // The conversion tax is calculated separately as marginal
    const taxableIncomeWithConversion = existingTaxableIncome + conversionAmount;
    const federalResult = calculateFederalTax({
      taxableIncome: taxableIncomeWithConversion,
      filingStatus: client.filing_status,
      taxYear: year
    });
    const stateResult = calculateStateTax({
      taxableIncome: taxableIncomeWithConversion,
      state: client.state,
      filingStatus: client.filing_status,
      overrideRate: stateTaxRateDecimal
    });

    // Total tax = federal + state + IRMAA
    // Note: For display, we use the conversion tax calculated above
    const totalTax = conversionTax + irmaaSurcharge;

    // End of Year balances
    iraBalance = iraAfterConversion + iraInterest;
    rothBalance = rothAfterConversion + rothInterest;

    // Taxable account:
    // - If tax paid from external (outside IRA), deduct tax from taxable account
    // - If tax paid from IRA, already accounted for in conversion amount reduction
    // NOTE: No interest applied - taxable represents taxes paid (fixed cost, not compounding debt)
    if (payTaxFromIRA) {
      taxableBalance = boyTaxable;
    } else {
      taxableBalance = boyTaxable - totalTax;
    }

    // Determine tax bracket
    const bracket = determineTaxBracket(taxableIncomeWithConversion, client.filing_status, year);

    results.push({
      year,
      age,
      spouseAge,
      traditionalBalance: iraBalance,
      rothBalance,
      taxableBalance,
      rmdAmount: 0, // No RMDs during conversion phase (converting before RMD age typically)
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
      taxableSS: 0, // SSI is tax-exempt per simplified model
      netWorth: iraBalance + rothBalance + taxableBalance
    });
  }

  return results;
}

/**
 * Calculate combined account interest for formula scenario
 * Per specification, interest accrues on both IRA and Roth after conversion
 */
export function calculateFormulaInterest(
  iraBeginning: number,
  conversionAmount: number,
  rothBeginning: number,
  rateOfReturn: number
): { iraInterest: number; rothInterest: number; totalInterest: number } {
  // IRA earns interest on remaining balance after conversion
  const iraAfterConversion = iraBeginning - conversionAmount;
  const iraInterest = Math.round(iraAfterConversion * rateOfReturn);

  // Roth earns interest on beginning balance + new conversion
  const rothAfterConversion = rothBeginning + conversionAmount;
  const rothInterest = Math.round(rothAfterConversion * rateOfReturn);

  return {
    iraInterest,
    rothInterest,
    totalInterest: iraInterest + rothInterest
  };
}
