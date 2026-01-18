import { Projection } from '@/lib/types/projection';

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
 * Transform projection data into chart-ready format
 * Extracts age, year, and net worth from both scenarios
 */
export function transformToChartData(projection: Projection): ChartDataPoint[] {
  // baseline_years and blueprint_years are arrays from the JSONB columns
  const baselineYears = projection.baseline_years;
  const blueprintYears = projection.blueprint_years;

  return baselineYears.map((baseYear, index) => ({
    age: baseYear.age,
    year: baseYear.year,
    baseline: baseYear.netWorth,
    blueprint: blueprintYears[index]?.netWorth ?? 0,
  }));
}

/**
 * Extract summary metrics from projection for stat cards
 * Uses pre-calculated final values from database for efficiency
 */
export function extractSummaryMetrics(projection: Projection): SummaryMetrics {
  return {
    baselineEndWealth: projection.baseline_final_net_worth,
    blueprintEndWealth: projection.blueprint_final_net_worth,
    difference: projection.blueprint_final_net_worth - projection.baseline_final_net_worth,
    totalTaxSavings: projection.total_tax_savings,
    breakEvenAge: projection.break_even_age,
    heirBenefit: projection.heir_benefit,
  };
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
