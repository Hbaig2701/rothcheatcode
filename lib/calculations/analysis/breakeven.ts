/**
 * Breakeven Analysis Module
 * Analyzes when Roth conversion strategy becomes beneficial
 */

import type { YearlyResult } from '../types';
import type { BreakEvenAnalysis, CrossoverPoint } from './types';

/**
 * Find the sustained breakeven age - when blueprint STAYS ahead
 * (not just a temporary crossover)
 */
function findSustainedBreakEven(
  baseline: YearlyResult[],
  blueprint: YearlyResult[],
  crossoverPoints: CrossoverPoint[]
): number | null {
  // Find first crossover to blueprint_ahead that doesn't reverse
  for (const point of crossoverPoints) {
    if (point.direction === 'blueprint_ahead') {
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
 * Analyze breakeven between baseline and blueprint scenarios
 * Returns multiple metrics for comprehensive understanding
 *
 * @param baseline - YearlyResult[] from no-conversion scenario
 * @param blueprint - YearlyResult[] from Roth conversion scenario
 * @returns BreakEvenAnalysis with simple, sustained breakeven and all crossovers
 */
export function analyzeBreakEven(
  baseline: YearlyResult[],
  blueprint: YearlyResult[]
): BreakEvenAnalysis {
  const crossoverPoints: CrossoverPoint[] = [];
  let lastDirection: 'blueprint_ahead' | 'baseline_ahead' | null = null;

  for (let i = 0; i < baseline.length; i++) {
    const diff = blueprint[i].netWorth - baseline[i].netWorth;
    const currentDirection: 'blueprint_ahead' | 'baseline_ahead' =
      diff > 0 ? 'blueprint_ahead' : 'baseline_ahead';

    // Detect crossover (direction change)
    if (lastDirection !== null && currentDirection !== lastDirection) {
      crossoverPoints.push({
        age: blueprint[i].age,
        year: blueprint[i].year,
        direction: currentDirection,
        wealthDifference: diff,
      });
    }
    lastDirection = currentDirection;
  }

  // Simple breakeven: first time blueprint goes ahead
  const simpleBreakEven = crossoverPoints.find(
    p => p.direction === 'blueprint_ahead'
  )?.age ?? null;

  // Sustained breakeven: when it stays ahead
  const sustainedBreakEven = findSustainedBreakEven(
    baseline, blueprint, crossoverPoints
  );

  // Net benefit: final difference
  const lastBaseline = baseline[baseline.length - 1];
  const lastBlueprint = blueprint[blueprint.length - 1];
  const netBenefit = lastBlueprint.netWorth - lastBaseline.netWorth;

  return {
    simpleBreakEven,
    sustainedBreakEven,
    netBenefit,
    crossoverPoints,
  };
}
