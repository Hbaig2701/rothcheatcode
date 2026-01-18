import type { StateTaxInput, StateTaxResult, TaxBracket } from '../types';
import { getStateByCode } from '@/lib/data/states';
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
 */
export function calculateStateTax(input: StateTaxInput): StateTaxResult {
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
