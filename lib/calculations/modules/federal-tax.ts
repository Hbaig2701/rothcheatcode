import type { FederalTaxInput, FederalTaxResult, BracketAmount, FilingStatus } from '../types';
import { getFederalBrackets, getBracketCeiling } from '@/lib/data/federal-brackets-2026';

export { getBracketCeiling };

/**
 * Calculate progressive federal income tax
 */
export function calculateFederalTax(input: FederalTaxInput): FederalTaxResult {
  const brackets = getFederalBrackets(input.taxYear, input.filingStatus);
  let remainingIncome = input.taxableIncome;
  let totalTax = 0;
  const breakdown: BracketAmount[] = [];

  for (const bracket of brackets) {
    if (remainingIncome <= 0) break;

    // Calculate the width of this bracket
    const bracketWidth = bracket.upper === Infinity
      ? remainingIncome
      : bracket.upper - bracket.lower;

    // How much of this bracket is taxable
    const taxableInBracket = Math.min(remainingIncome, bracketWidth);

    // Calculate tax for this bracket (rate is percentage, e.g., 22)
    const taxInBracket = Math.round(taxableInBracket * bracket.rate / 100);

    if (taxInBracket > 0) {
      totalTax += taxInBracket;
      breakdown.push({ rate: bracket.rate, amount: taxInBracket });
    }

    remainingIncome -= taxableInBracket;
  }

  const effectiveRate = input.taxableIncome > 0
    ? (totalTax / input.taxableIncome) * 100
    : 0;

  const marginalBracket = breakdown.length > 0
    ? breakdown[breakdown.length - 1].rate
    : 0;

  return {
    totalTax,
    effectiveRate,
    marginalBracket,
    bracketBreakdown: breakdown
  };
}

/**
 * Calculate taxable income from gross income
 */
export function calculateTaxableIncome(grossIncome: number, deductions: number): number {
  return Math.max(0, grossIncome - deductions);
}

/**
 * Calculate the marginal tax on a Roth conversion amount
 * This is the incremental tax from adding the conversion to existing income.
 *
 * Per specification:
 * federal_tax = tax_with_conversion - tax_without_conversion
 *
 * @param conversionAmount The Roth conversion amount in cents
 * @param existingTaxableIncome The taxable income before conversion in cents
 * @param filingStatus Filing status
 * @param taxYear Tax year
 */
export function calculateConversionFederalTax(
  conversionAmount: number,
  existingTaxableIncome: number,
  filingStatus: FilingStatus,
  taxYear: number
): number {
  if (conversionAmount <= 0) return 0;

  // Tax on existing income only
  const taxWithoutConversion = calculateFederalTax({
    taxableIncome: existingTaxableIncome,
    filingStatus,
    taxYear
  }).totalTax;

  // Tax on total income (existing + conversion)
  const totalTaxableIncome = existingTaxableIncome + conversionAmount;
  const taxWithConversion = calculateFederalTax({
    taxableIncome: totalTaxableIncome,
    filingStatus,
    taxYear
  }).totalTax;

  // Marginal tax on conversion
  return taxWithConversion - taxWithoutConversion;
}

/**
 * Calculate the optimal Roth conversion amount that fills up to the target bracket
 *
 * Per specification:
 * Max_Conversion = Bracket_Ceiling - Existing_Taxable_Income
 * Actual_Conversion = MIN(Max_Conversion, IRA_Balance)
 *
 * @param iraBalance Current IRA balance in cents
 * @param existingTaxableIncome Taxable income before conversion in cents
 * @param maxBracketRate Target bracket rate (e.g., 24)
 * @param filingStatus Filing status
 * @param taxYear Tax year
 */
export function calculateOptimalConversion(
  iraBalance: number,
  existingTaxableIncome: number,
  maxBracketRate: number,
  filingStatus: FilingStatus,
  taxYear: number
): number {
  if (iraBalance <= 0) return 0;

  // Get the ceiling for the target bracket
  const bracketCeiling = getBracketCeiling(filingStatus, maxBracketRate, taxYear);
  if (bracketCeiling === 0 || bracketCeiling === Infinity) {
    // Invalid bracket rate or unlimited - just use IRA balance
    return iraBalance;
  }

  // Room available in the bracket
  const roomInBracket = Math.max(0, bracketCeiling - existingTaxableIncome);

  // Cannot convert more than IRA balance
  const optimalConversion = Math.min(roomInBracket, iraBalance);

  return optimalConversion;
}

/**
 * Determine which tax bracket a given taxable income falls into
 *
 * @param taxableIncome Taxable income in cents
 * @param filingStatus Filing status
 * @param taxYear Tax year
 */
export function determineTaxBracket(
  taxableIncome: number,
  filingStatus: FilingStatus,
  taxYear: number
): number {
  const brackets = getFederalBrackets(taxYear, filingStatus);

  for (const bracket of brackets) {
    if (taxableIncome <= bracket.upper) {
      return bracket.rate;
    }
  }

  // If we're above all brackets, return the highest rate
  return brackets[brackets.length - 1]?.rate ?? 37;
}
