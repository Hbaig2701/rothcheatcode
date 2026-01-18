import type { FederalTaxInput, FederalTaxResult, BracketAmount } from '../types';
import { getFederalBrackets } from '@/lib/data/federal-brackets-2026';

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
