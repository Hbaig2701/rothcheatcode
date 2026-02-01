/**
 * Analysis Types for Advanced Features
 * Types for breakeven, sensitivity, and widow penalty analysis
 */

import type { YearlyResult } from '../types';

// ============================================================
// Breakeven Analysis Types
// ============================================================

/**
 * Represents a point where baseline and cheatCode wealth cross
 */
export interface CrossoverPoint {
  age: number;
  year: number;
  direction: 'cheatCode_ahead' | 'baseline_ahead';
  wealthDifference: number; // cents
}

/**
 * Complete breakeven analysis result
 */
export interface BreakEvenAnalysis {
  simpleBreakEven: number | null;     // First crossover age
  sustainedBreakEven: number | null;  // Age when cheatCode STAYS ahead
  netBenefit: number;                 // Total wealth advantage at end (cents)
  crossoverPoints: CrossoverPoint[];  // All crossover events
}

// ============================================================
// Sensitivity Analysis Types
// ============================================================

/**
 * Configuration for a sensitivity scenario
 */
export interface SensitivityScenario {
  name: string;
  growthRate: number;           // percentage e.g., 6
  taxRateMultiplier: number;    // 1.0 = current law, 1.2 = +20%
}

/**
 * Results from running multiple sensitivity scenarios
 */
export interface SensitivityResult {
  scenarios: Record<string, {
    baseline: YearlyResult[];
    cheatCode: YearlyResult[];
    breakEvenAge: number | null;
    endingWealth: number;         // cheatCode final net worth (cents)
  }>;
  breakEvenRange: {
    min: number | null;
    max: number | null;
  };
  wealthRange: {
    min: number;
    max: number;
  };
}

// ============================================================
// Widow's Penalty Analysis Types
// ============================================================

/**
 * Tax impact comparison for married vs single filing
 */
export interface WidowTaxImpact {
  marriedTax: number;          // cents
  marriedBracket: number;      // percentage
  singleTax: number;           // cents
  singleBracket: number;       // percentage
  taxIncrease: number;         // cents (can be negative)
  bracketJump: number;         // percentage points
}

/**
 * Complete widow's penalty analysis
 */
export interface WidowAnalysisResult {
  deathYear: number;
  preDeathScenario: YearlyResult[];  // Before spouse death
  postDeathScenario: YearlyResult[]; // After as single filer
  taxImpactByYear: WidowTaxImpact[];
  totalAdditionalTax: number;         // cents over remaining years
  recommendedConversionIncrease: number; // cents/year
}
