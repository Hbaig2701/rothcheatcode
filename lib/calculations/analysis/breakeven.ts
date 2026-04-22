/**
 * Breakeven Analysis Module
 * Analyzes when Roth conversion strategy becomes beneficial
 */

import type { YearlyResult } from '../types';
import type { BreakEvenAnalysis, CrossoverPoint } from './types';

const DEFAULT_HEIR_TAX_RATE = 40;

/**
 * Legacy-to-heirs wealth at a given year.
 *
 * This is the metric that matters for Roth-conversion breakeven analysis:
 * Traditional × (1 − heir_tax_rate) + Roth + max(0, taxable). Gross netWorth
 * is misleading because the conversion pays upfront tax that permanently
 * puts formula below baseline — even when the strategy clearly wins in
 * economic terms (Roth passes tax-free, so heirs receive more).
 *
 * Matches calculateFormulaLegacyToHeirs / calculateBaselineLegacyToHeirs in
 * transforms.ts, which is what the dashboard WealthChart draws.
 */
function legacyToHeirs(year: YearlyResult, heirRate: number): number {
  // Taxable balance included SIGNED — a negative balance is conversion tax
  // paid from outside the IRA, a real cost that the strategy owes. Clipping
  // it to zero used to make year-1 advantages look ~50% bigger than reality.
  return (
    Math.round(year.traditionalBalance * (1 - heirRate)) +
    year.rothBalance +
    (year.taxableBalance || 0)
  );
}

/**
 * Find the sustained breakeven age - when formula STAYS ahead
 * (not just a temporary crossover)
 */
function findSustainedBreakEven(
  baseline: YearlyResult[],
  formula: YearlyResult[],
  crossoverPoints: CrossoverPoint[]
): number | null {
  // Find first crossover to formula_ahead that doesn't reverse
  for (const point of crossoverPoints) {
    if (point.direction === 'formula_ahead') {
      // Check if it ever crosses back
      const reversesLater = crossoverPoints.some(
        p => p.age > point.age && p.direction === 'baseline_ahead'
      );
      if (!reversesLater) {
        return point.age;
      }
    }
  }
  return null;
}

/**
 * Analyze breakeven between baseline and formula scenarios
 * Returns multiple metrics for comprehensive understanding
 *
 * @param baseline - YearlyResult[] from no-conversion scenario
 * @param formula - YearlyResult[] from Roth conversion scenario
 * @param heirTaxRate - Heir tax rate as percentage (default 40). Used to
 *        apply the legacy-to-heirs adjustment so that breakeven reflects
 *        what the strategy is ACTUALLY optimizing for — post-heir-tax
 *        wealth transferred to beneficiaries.
 * @returns BreakEvenAnalysis with simple, sustained breakeven and all crossovers
 */
export function analyzeBreakEven(
  baseline: YearlyResult[],
  formula: YearlyResult[],
  heirTaxRate: number = DEFAULT_HEIR_TAX_RATE,
): BreakEvenAnalysis {
  const heirRate = heirTaxRate / 100;
  const crossoverPoints: CrossoverPoint[] = [];
  let lastDirection: 'formula_ahead' | 'baseline_ahead' | null = null;

  // Track whether formula started ahead (no crossover needed — already there).
  let initialFormulaAhead: { age: number; year: number; diff: number } | null = null;

  for (let i = 0; i < baseline.length; i++) {
    const baselineLegacy = legacyToHeirs(baseline[i], heirRate);
    const formulaLegacy = legacyToHeirs(formula[i], heirRate);
    const diff = formulaLegacy - baselineLegacy;
    const currentDirection: 'formula_ahead' | 'baseline_ahead' =
      diff > 0 ? 'formula_ahead' : 'baseline_ahead';

    if (lastDirection === null) {
      // First year — no crossover yet, but record if formula starts ahead.
      if (currentDirection === 'formula_ahead') {
        initialFormulaAhead = { age: formula[i].age, year: formula[i].year, diff };
      }
    } else if (currentDirection !== lastDirection) {
      // Detect crossover (direction change)
      crossoverPoints.push({
        age: formula[i].age,
        year: formula[i].year,
        direction: currentDirection,
        wealthDifference: diff,
      });
    }
    lastDirection = currentDirection;
  }

  // Simple breakeven: first time formula is ahead. If it was ahead from the
  // very first year there's no "crossover" event, but breakeven is still
  // year 0 — the strategy starts winning immediately.
  const firstCrossover = crossoverPoints.find(p => p.direction === 'formula_ahead');
  const simpleBreakEven = initialFormulaAhead?.age
    ?? firstCrossover?.age
    ?? null;

  // Sustained breakeven: when it stays ahead. If formula started ahead AND
  // there's never a baseline_ahead crossover, sustained = year 0.
  const anyReversal = crossoverPoints.some(p => p.direction === 'baseline_ahead');
  const sustainedBreakEven = initialFormulaAhead && !anyReversal
    ? initialFormulaAhead.age
    : findSustainedBreakEven(baseline, formula, crossoverPoints);

  // Net benefit: final difference (also legacy-to-heirs adjusted)
  const lastBaseline = baseline[baseline.length - 1];
  const lastFormula = formula[formula.length - 1];
  const netBenefit =
    legacyToHeirs(lastFormula, heirRate) - legacyToHeirs(lastBaseline, heirRate);

  return {
    simpleBreakEven,
    sustainedBreakEven,
    netBenefit,
    crossoverPoints,
  };
}
