/**
 * Compute how a year's taxable income fills the federal tax brackets.
 *
 * Returned shape gives the playground everything it needs to render a
 * bracket-fill chart: each bracket with its bounds, how much of the
 * taxable income landed in it, and the tax that slice produced. Brackets
 * with zero fill are still included (so the chart shows them as empty
 * outlines), which makes the "you converted enough to bump into the next
 * bracket" effect visually obvious.
 */

import { getFederalBrackets } from '@/lib/data/federal-brackets-2026';
import type { FilingStatus } from '@/lib/calculations/types';

export interface BracketFill {
  rate: number; // 10, 12, 22, 24, 32, 35, 37
  lower: number; // cents
  upper: number; // cents - Infinity for the top bracket
  bracketWidth: number; // cents - upper - lower (or income amount for top bracket)
  incomeInBracket: number; // cents
  taxInBracket: number; // cents
}

export function buildBracketFill(
  taxableIncome: number, // cents
  filingStatus: FilingStatus,
  taxYear: number,
): BracketFill[] {
  const brackets = getFederalBrackets(taxYear, filingStatus);
  let remaining = Math.max(0, taxableIncome);
  const result: BracketFill[] = [];

  for (const b of brackets) {
    const isTop = b.upper === Infinity;
    // For the top bracket, give it a synthetic "width" equal to whatever's
    // left so the bar can render - but only if anything reaches it. If
    // nothing reaches the top bracket, give it a small representative
    // width so the empty outline is still visible to the eye.
    const baseWidth = isTop ? Math.max(remaining, 50_000_00) : b.upper - b.lower;
    const incomeInBracket = isTop ? remaining : Math.min(remaining, baseWidth);
    const taxInBracket = Math.round((incomeInBracket * b.rate) / 100);

    result.push({
      rate: b.rate,
      lower: b.lower,
      upper: b.upper,
      bracketWidth: baseWidth,
      incomeInBracket,
      taxInBracket,
    });

    remaining = Math.max(0, remaining - incomeInBracket);
  }

  return result;
}

/**
 * Marginal rate = rate of the highest bracket that has any income in it.
 * Returns 0 if no taxable income at all.
 */
export function marginalRate(fill: BracketFill[]): number {
  for (let i = fill.length - 1; i >= 0; i--) {
    if (fill[i].incomeInBracket > 0) return fill[i].rate;
  }
  return 0;
}

/**
 * Effective rate = total federal tax / total taxable income, as percent.
 * Returns 0 if no taxable income.
 */
export function effectiveRate(fill: BracketFill[], taxableIncome: number): number {
  if (taxableIncome <= 0) return 0;
  const totalTax = fill.reduce((s, b) => s + b.taxInBracket, 0);
  return (totalTax / taxableIncome) * 100;
}
