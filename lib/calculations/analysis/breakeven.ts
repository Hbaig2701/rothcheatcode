/**
 * Breakeven Analysis Module — Tax Payback
 *
 * "Breakeven" = the age at which the strategy's cumulative tax paid drops
 * to or below the baseline's cumulative tax paid. In plain terms: how long
 * it takes for the annual tax savings (smaller RMDs, lower bracket, less
 * IRMAA) to earn back the upfront conversion tax.
 *
 * This replaces a prior "legacy to heirs" definition which produced
 * breakeven at year 1 for most clients (because heir tax > conversion tax
 * creates immediate tax-rate arbitrage). That was mathematically correct
 * but useless as a "when does this pay off" signal for advisors.
 */

import type { YearlyResult } from '../types';
import type { BreakEvenAnalysis, CrossoverPoint, TaxPaybackPoint } from './types';

/**
 * Build the per-year cumulative-tax comparison series used by the chart
 * and the breakeven calculation. totalTax includes federal + state + IRMAA
 * + any early-withdrawal penalty — every dollar the IRS and state
 * collectively take from the client each year.
 */
function buildTaxPaybackSeries(
  baseline: YearlyResult[],
  formula: YearlyResult[]
): TaxPaybackPoint[] {
  const points: TaxPaybackPoint[] = [];
  let baseCum = 0;
  let stratCum = 0;
  const n = Math.min(baseline.length, formula.length);
  for (let i = 0; i < n; i++) {
    baseCum += baseline[i].totalTax || 0;
    stratCum += formula[i].totalTax || 0;
    points.push({
      age: formula[i].age,
      year: formula[i].year,
      baselineCumulativeTax: baseCum,
      strategyCumulativeTax: stratCum,
      savings: baseCum - stratCum,
    });
  }
  return points;
}

/**
 * Find the first age where strategy cumulative tax ≤ baseline cumulative tax.
 * Returns null if the strategy never catches up in the projection window
 * (meaning the upfront tax cost isn't recouped within the client's remaining
 * years — rare but possible for older clients or aggressive conversions
 * deep into high brackets).
 */
function findPaybackAge(points: TaxPaybackPoint[]): number | null {
  for (const p of points) {
    if (p.strategyCumulativeTax <= p.baselineCumulativeTax) {
      return p.age;
    }
  }
  return null;
}

/**
 * Find the age where strategy STAYS ahead on cumulative tax (no reversal).
 * Typically this is the same as the simple payback age once we hit it —
 * cumulative tax only grows, so once strategy falls behind (i.e. paid less)
 * it stays behind. But defensive in case of unusual tax-law changes or
 * scenario mixes that could flip.
 */
function findSustainedPayback(points: TaxPaybackPoint[]): number | null {
  for (let i = 0; i < points.length; i++) {
    if (points[i].strategyCumulativeTax <= points[i].baselineCumulativeTax) {
      // Check the rest of the projection — does strategy stay at or below?
      const stays = points.slice(i).every(
        p => p.strategyCumulativeTax <= p.baselineCumulativeTax
      );
      if (stays) return points[i].age;
    }
  }
  return null;
}

/**
 * Analyze breakeven between baseline and formula scenarios.
 *
 * @param baseline - YearlyResult[] from no-conversion scenario
 * @param formula - YearlyResult[] from Roth conversion scenario
 * @param _heirTaxRate - Accepted for backwards compatibility with callers that
 *        pass it; no longer used. Breakeven is tax-payback based, independent
 *        of heir tax.
 */
export function analyzeBreakEven(
  baseline: YearlyResult[],
  formula: YearlyResult[],
  _heirTaxRate: number = 40,
): BreakEvenAnalysis {
  const taxPaybackData = buildTaxPaybackSeries(baseline, formula);

  const simpleBreakEven = findPaybackAge(taxPaybackData);
  const sustainedBreakEven = findSustainedPayback(taxPaybackData);

  // Track direction changes (rare, but possible if a late-life event swings
  // cumulative tax back). Useful context when it happens.
  const crossoverPoints: CrossoverPoint[] = [];
  let lastDirection: 'formula_ahead' | 'baseline_ahead' | null = null;
  for (const p of taxPaybackData) {
    const currentDirection: 'formula_ahead' | 'baseline_ahead' =
      p.strategyCumulativeTax <= p.baselineCumulativeTax
        ? 'formula_ahead'
        : 'baseline_ahead';
    if (lastDirection !== null && currentDirection !== lastDirection) {
      crossoverPoints.push({
        age: p.age,
        year: p.year,
        direction: currentDirection,
        wealthDifference: p.savings,
      });
    }
    lastDirection = currentDirection;
  }

  const netBenefit = taxPaybackData.length > 0
    ? taxPaybackData[taxPaybackData.length - 1].savings
    : 0;

  return {
    simpleBreakEven,
    sustainedBreakEven,
    netBenefit,
    crossoverPoints,
    taxPaybackData,
  };
}
