/**
 * Analysis Types for Advanced Features
 * Types for breakeven, sensitivity, and widow penalty analysis
 */

import type { YearlyResult } from '../types';

// ============================================================
// Breakeven Analysis Types
// ============================================================

/**
 * One year of cumulative tax paid under each scenario. Used to plot the
 * Advanced Analysis "Tax Payback" chart — baseline line grows as RMDs
 * are taxed each year, strategy line jumps up front then grows slowly.
 * They cross at the payback age.
 */
export interface TaxPaybackPoint {
  age: number;
  year: number;
  baselineCumulativeTax: number;  // cents
  strategyCumulativeTax: number;  // cents
  savings: number;                // baseline - strategy, cents
}

/**
 * Represents a point where cumulative taxes cross over
 */
export interface CrossoverPoint {
  age: number;
  year: number;
  direction: 'formula_ahead' | 'baseline_ahead';
  wealthDifference: number; // cents — savings at that point (baseline cum tax - strategy cum tax)
}

/**
 * Complete breakeven analysis result.
 *
 * "Breakeven" here means tax payback: the age at which the cumulative tax
 * paid by the strategy drops to or below the cumulative tax paid by the
 * baseline. In plain terms, the age at which the upfront conversion tax
 * has been fully recouped through lower annual taxes in later years.
 *
 * This is what advisors and clients actually mean by "breakeven" — how
 * long it takes to earn back what you paid upfront. Not the legacy-to-
 * heirs crossover (which happens in year 1 for any client where heir
 * tax > conversion tax, so it's not very useful as a "breakeven" metric).
 */
export interface BreakEvenAnalysis {
  simpleBreakEven: number | null;     // First age where cumulative strategy tax ≤ cumulative baseline tax
  sustainedBreakEven: number | null;  // Age when strategy STAYS ahead on cumulative tax
  netBenefit: number;                 // Final cumulative ANNUAL tax savings at end of projection (cents)
  heirTaxSavings: number;             // One-time savings from less Traditional IRA passing to heirs (cents)
  crossoverPoints: CrossoverPoint[];  // All crossover events (rare — usually just one)
  taxPaybackData: TaxPaybackPoint[];  // Per-year cumulative tax for chart plotting
  // Peak deficit = maximum (strategy_cum_tax − baseline_cum_tax) across the
  // projection. Represents how much "extra" tax the strategy paid upfront
  // vs the baseline — i.e., the amount that needs to be earned back through
  // later annual savings. Used to detect "marginal payback" cases where the
  // strategy technically crosses but the savings is trivial relative to the
  // upfront cost (e.g., client in same bracket during conversion and RMD
  // years has near-zero tax arbitrage). Cents.
  peakStrategyDeficit: number;
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
    formula: YearlyResult[];
    breakEvenAge: number | null;
    endingWealth: number;         // formula final net worth (cents)
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
