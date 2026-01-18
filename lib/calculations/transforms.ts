import { Projection } from '@/lib/types/projection';
import { SimulationResult } from './types';

/**
 * Data point for wealth chart
 */
export interface ChartDataPoint {
  age: number;
  year: number;
  baseline: number;   // Net worth in cents
  blueprint: number;  // Net worth in cents
}

/**
 * Summary metrics for stat cards
 */
export interface SummaryMetrics {
  baselineEndWealth: number;    // Final year netWorth, cents
  blueprintEndWealth: number;   // Final year netWorth, cents
  difference: number;           // blueprint - baseline, cents
  totalTaxSavings: number;      // From projection, cents
  breakEvenAge: number | null;  // Age where blueprint exceeds baseline
  heirBenefit: number;          // Benefit to heirs, cents
}

/**
 * Type guard to check if input is a Projection (from database)
 */
function isProjection(input: Projection | SimulationResult): input is Projection {
  return 'baseline_years' in input && 'blueprint_years' in input;
}

/**
 * Transform projection data into chart-ready format
 * Extracts age, year, and net worth from both scenarios
 * Accepts either database Projection or in-memory SimulationResult
 */
export function transformToChartData(data: Projection | SimulationResult): ChartDataPoint[] {
  if (isProjection(data)) {
    // Database Projection (snake_case)
    const baselineYears = data.baseline_years;
    const blueprintYears = data.blueprint_years;

    return baselineYears.map((baseYear, index) => ({
      age: baseYear.age,
      year: baseYear.year,
      baseline: baseYear.netWorth,
      blueprint: blueprintYears[index]?.netWorth ?? 0,
    }));
  } else {
    // In-memory SimulationResult (camelCase)
    const { baseline, blueprint } = data;

    return baseline.map((baseYear, index) => ({
      age: baseYear.age,
      year: baseYear.year,
      baseline: baseYear.netWorth,
      blueprint: blueprint[index]?.netWorth ?? 0,
    }));
  }
}

/**
 * Extract summary metrics from projection for stat cards
 * Accepts either database Projection or in-memory SimulationResult
 */
export function extractSummaryMetrics(data: Projection | SimulationResult): SummaryMetrics {
  if (isProjection(data)) {
    // Database Projection - uses pre-calculated final values
    return {
      baselineEndWealth: data.baseline_final_net_worth,
      blueprintEndWealth: data.blueprint_final_net_worth,
      difference: data.blueprint_final_net_worth - data.baseline_final_net_worth,
      totalTaxSavings: data.total_tax_savings,
      breakEvenAge: data.break_even_age,
      heirBenefit: data.heir_benefit,
    };
  } else {
    // In-memory SimulationResult - extract from arrays
    const lastBaseline = data.baseline[data.baseline.length - 1];
    const lastBlueprint = data.blueprint[data.blueprint.length - 1];

    return {
      baselineEndWealth: lastBaseline.netWorth,
      blueprintEndWealth: lastBlueprint.netWorth,
      difference: lastBlueprint.netWorth - lastBaseline.netWorth,
      totalTaxSavings: data.totalTaxSavings,
      breakEvenAge: data.breakEvenAge,
      heirBenefit: data.heirBenefit,
    };
  }
}

/**
 * Format cents as currency string for display
 * Uses Intl.NumberFormat for proper locale handling
 */
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/**
 * Format cents for Y-axis labels (abbreviated)
 * Converts to K (thousands) or M (millions) for readability
 */
export function formatAxisValue(cents: number): string {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1_000_000) {
    return `$${(dollars / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(dollars) >= 1_000) {
    return `$${(dollars / 1_000).toFixed(0)}K`;
  }
  return `$${dollars.toFixed(0)}`;
}
