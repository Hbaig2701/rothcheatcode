import type { StateTaxInput, StateTaxResult, TaxBracket } from '../types';
import { getStateByCode, getStateTaxRate } from '@/lib/data/states';
import { getStateBrackets } from '@/lib/data/state-brackets';

/**
 * Calculate progressive tax across brackets
 */
function calculateProgressiveTax(income: number, brackets: TaxBracket[]): number {
  let remainingIncome = income;
  let totalTax = 0;

  for (const bracket of brackets) {
    if (remainingIncome <= 0) break;

    const bracketWidth = bracket.upper === Infinity
      ? remainingIncome
      : bracket.upper - bracket.lower;

    const taxableInBracket = Math.min(remainingIncome, bracketWidth);
    totalTax += Math.round(taxableInBracket * bracket.rate / 100);
    remainingIncome -= taxableInBracket;
  }

  return totalTax;
}

/**
 * Calculate state income tax
 * Handles no-tax, flat, and progressive states
 * Supports optional override rate from user input
 */
export function calculateStateTax(input: StateTaxInput): StateTaxResult {
  // If override rate is provided, use it directly (simplified flat rate)
  if (input.overrideRate !== undefined && input.overrideRate !== null) {
    const totalTax = Math.round(input.taxableIncome * input.overrideRate);
    const effectiveRate = input.overrideRate * 100;
    return { totalTax, effectiveRate };
  }

  const stateInfo = getStateByCode(input.state);

  if (!stateInfo) {
    // Unknown state - assume no tax
    return { totalTax: 0, effectiveRate: 0 };
  }

  // No income tax states
  if (stateInfo.taxType === 'none') {
    return { totalTax: 0, effectiveRate: 0 };
  }

  // Flat tax states
  if (stateInfo.taxType === 'flat') {
    const totalTax = Math.round(input.taxableIncome * stateInfo.topRate / 100);
    return {
      totalTax,
      effectiveRate: stateInfo.topRate
    };
  }

  // Progressive tax states
  const brackets = getStateBrackets(input.state, input.filingStatus);

  if (brackets) {
    // Full bracket calculation
    const totalTax = calculateProgressiveTax(input.taxableIncome, brackets);
    const effectiveRate = input.taxableIncome > 0
      ? (totalTax / input.taxableIncome) * 100
      : 0;
    return { totalTax, effectiveRate };
  }

  // Fallback: use top rate as approximation
  const totalTax = Math.round(input.taxableIncome * stateInfo.topRate / 100);
  return {
    totalTax,
    effectiveRate: stateInfo.topRate
  };
}

/**
 * Calculate state tax on a Roth conversion amount
 * Per specification: state_tax = conversion_amount × state_rate
 *
 * Uses the simplified flat rate from the specification for conversion calculations.
 *
 * @param conversionAmount The conversion amount in cents
 * @param state State code (e.g., "CA") or state name (e.g., "California")
 * @param overrideRate Optional rate override (decimal, e.g., 0.05 for 5%)
 */
export function calculateConversionStateTax(
  conversionAmount: number,
  state: string,
  overrideRate?: number
): number {
  if (conversionAmount <= 0) return 0;

  // Use override rate if provided, otherwise look up the rate
  const rate = overrideRate ?? getStateTaxRate(state);

  // State tax on conversion (flat rate per specification)
  return Math.round(conversionAmount * rate);
}

/**
 * Calculate combined federal and state tax on a Roth conversion
 * Per specification:
 * total_tax = federal_marginal_tax + (conversion × state_rate)
 */
export interface ConversionTaxResult {
  federalTax: number;
  stateTax: number;
  totalTax: number;
}

export function calculateConversionTotalTax(
  conversionAmount: number,
  existingTaxableIncome: number,
  filingStatus: string,
  state: string,
  taxYear: number,
  stateRateOverride?: number
): ConversionTaxResult {
  // Import here to avoid circular dependency
  const { calculateConversionFederalTax } = require('./federal-tax');

  const federalTax = calculateConversionFederalTax(
    conversionAmount,
    existingTaxableIncome,
    filingStatus,
    taxYear
  );

  const stateTax = calculateConversionStateTax(conversionAmount, state, stateRateOverride);

  return {
    federalTax,
    stateTax,
    totalTax: federalTax + stateTax
  };
}
