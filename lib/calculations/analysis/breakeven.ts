/**
 * Breakeven Analysis Module
 * Analyzes when Roth conversion strategy becomes beneficial
 */

import type { YearlyResult } from '../types';
import type { BreakEvenAnalysis, CrossoverPoint } from './types';

/**
 * Find the sustained breakeven age - when cheatCode STAYS ahead
 * (not just a temporary crossover)
 */
function findSustainedBreakEven(
  baseline: YearlyResult[],
  cheatCode: YearlyResult[],
  crossoverPoints: CrossoverPoint[]
): number | null {
  // Find first crossover to cheatCode_ahead that doesn't reverse
  for (const point of crossoverPoints) {
    if (point.direction === 'cheatCode_ahead') {
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
 * Analyze breakeven between baseline and cheatCode scenarios
 * Returns multiple metrics for comprehensive understanding
 *
 * @param baseline - YearlyResult[] from no-conversion scenario
 * @param cheatCode - YearlyResult[] from Roth conversion scenario
 * @returns BreakEvenAnalysis with simple, sustained breakeven and all crossovers
 */
export function analyzeBreakEven(
  baseline: YearlyResult[],
  cheatCode: YearlyResult[]
): BreakEvenAnalysis {
  const crossoverPoints: CrossoverPoint[] = [];
  let lastDirection: 'cheatCode_ahead' | 'baseline_ahead' | null = null;

  for (let i = 0; i < baseline.length; i++) {
    const diff = cheatCode[i].netWorth - baseline[i].netWorth;
    const currentDirection: 'cheatCode_ahead' | 'baseline_ahead' =
      diff > 0 ? 'cheatCode_ahead' : 'baseline_ahead';

    // Detect crossover (direction change)
    if (lastDirection !== null && currentDirection !== lastDirection) {
      crossoverPoints.push({
        age: cheatCode[i].age,
        year: cheatCode[i].year,
        direction: currentDirection,
        wealthDifference: diff,
      });
    }
    lastDirection = currentDirection;
  }

  // Simple breakeven: first time cheatCode goes ahead
  const simpleBreakEven = crossoverPoints.find(
    p => p.direction === 'cheatCode_ahead'
  )?.age ?? null;

  // Sustained breakeven: when it stays ahead
  const sustainedBreakEven = findSustainedBreakEven(
    baseline, cheatCode, crossoverPoints
  );

  // Net benefit: final difference
  const lastBaseline = baseline[baseline.length - 1];
  const lastCheatCode = cheatCode[cheatCode.length - 1];
  const netBenefit = lastCheatCode.netWorth - lastBaseline.netWorth;

  return {
    simpleBreakEven,
    sustainedBreakEven,
    netBenefit,
    crossoverPoints,
  };
}
