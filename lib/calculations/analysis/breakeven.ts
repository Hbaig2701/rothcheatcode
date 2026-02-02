/**
 * Breakeven Analysis Module
 * Analyzes when Roth conversion strategy becomes beneficial
 */

import type { YearlyResult } from '../types';
import type { BreakEvenAnalysis, CrossoverPoint } from './types';

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
 * @returns BreakEvenAnalysis with simple, sustained breakeven and all crossovers
 */
export function analyzeBreakEven(
  baseline: YearlyResult[],
  formula: YearlyResult[]
): BreakEvenAnalysis {
  const crossoverPoints: CrossoverPoint[] = [];
  let lastDirection: 'formula_ahead' | 'baseline_ahead' | null = null;

  for (let i = 0; i < baseline.length; i++) {
    const diff = formula[i].netWorth - baseline[i].netWorth;
    const currentDirection: 'formula_ahead' | 'baseline_ahead' =
      diff > 0 ? 'formula_ahead' : 'baseline_ahead';

    // Detect crossover (direction change)
    if (lastDirection !== null && currentDirection !== lastDirection) {
      crossoverPoints.push({
        age: formula[i].age,
        year: formula[i].year,
        direction: currentDirection,
        wealthDifference: diff,
      });
    }
    lastDirection = currentDirection;
  }

  // Simple breakeven: first time formula goes ahead
  const simpleBreakEven = crossoverPoints.find(
    p => p.direction === 'formula_ahead'
  )?.age ?? null;

  // Sustained breakeven: when it stays ahead
  const sustainedBreakEven = findSustainedBreakEven(
    baseline, formula, crossoverPoints
  );

  // Net benefit: final difference
  const lastBaseline = baseline[baseline.length - 1];
  const lastFormula = formula[formula.length - 1];
  const netBenefit = lastFormula.netWorth - lastBaseline.netWorth;

  return {
    simpleBreakEven,
    sustainedBreakEven,
    netBenefit,
    crossoverPoints,
  };
}
