import { Projection } from '@/lib/types/projection';
import { SimulationResult, YearlyResult } from './types';
import type { SensitivityResult } from './analysis/types';

/**
 * Data point for wealth chart
 * Now represents Lifetime Wealth Trajectory (not account balances)
 */
export interface ChartDataPoint {
  age: number;
  year: number;
  baseline: number;   // Lifetime wealth in cents
  blueprint: number;  // Lifetime wealth in cents
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
 * Calculate Lifetime Wealth Trajectory for a scenario
 *
 * Lifetime Wealth = Cumulative After-Tax Distributions + Net Legacy Value - Cumulative IRMAA
 *
 * @param years - Array of yearly results
 * @param scenario - 'baseline' (heirs pay 40% tax) or 'blueprint' (heirs pay 0% tax)
 * @param heirTaxRate - Tax rate heirs pay on inherited Traditional IRA (default 40%)
 */
function calculateLifetimeWealthTrajectory(
  years: YearlyResult[],
  scenario: 'baseline' | 'blueprint',
  heirTaxRate: number = 0.40
): number[] {
  let cumulativeAfterTaxDist = 0;
  let cumulativeIRMAA = 0;

  return years.map(year => {
    // After-tax distribution = (RMD + Conversion) - (Federal Tax + State Tax)
    const distribution = year.rmdAmount + year.conversionAmount;
    const taxes = year.federalTax + year.stateTax;
    const afterTaxDist = distribution - taxes;
    cumulativeAfterTaxDist += afterTaxDist;

    // Cumulative IRMAA
    cumulativeIRMAA += year.irmaaSurcharge || 0;

    // Net Legacy Value based on scenario
    // Baseline (Traditional IRA): heirs pay tax on inheritance
    // Blueprint (Roth): heirs pay no tax
    const netLegacy = scenario === 'baseline'
      ? year.netWorth * (1 - heirTaxRate)
      : year.netWorth;

    // Lifetime Wealth = cumulative after-tax distributions + net legacy - cumulative IRMAA
    return cumulativeAfterTaxDist + netLegacy - cumulativeIRMAA;
  });
}

/**
 * Transform projection data into chart-ready format
 * Calculates Lifetime Wealth Trajectory for both scenarios
 *
 * Lifetime Wealth represents "if I died at this age, what would my total lifetime wealth be?"
 * Formula: Cumulative After-Tax Distributions + Net Legacy Value - Cumulative IRMAA
 *
 * Accepts either database Projection or in-memory SimulationResult
 */
export function transformToChartData(data: Projection | SimulationResult): ChartDataPoint[] {
  if (isProjection(data)) {
    // Database Projection (snake_case)
    const baselineYears = data.baseline_years;
    const blueprintYears = data.blueprint_years;

    const baselineWealth = calculateLifetimeWealthTrajectory(baselineYears, 'baseline');
    const blueprintWealth = calculateLifetimeWealthTrajectory(blueprintYears, 'blueprint');

    return baselineYears.map((baseYear, index) => ({
      age: baseYear.age,
      year: baseYear.year,
      baseline: Math.round(baselineWealth[index]),
      blueprint: Math.round(blueprintWealth[index]),
    }));
  } else {
    // In-memory SimulationResult (camelCase)
    const { baseline, blueprint } = data;

    const baselineWealth = calculateLifetimeWealthTrajectory(baseline, 'baseline');
    const blueprintWealth = calculateLifetimeWealthTrajectory(blueprint, 'blueprint');

    return baseline.map((baseYear, index) => ({
      age: baseYear.age,
      year: baseYear.year,
      baseline: Math.round(baselineWealth[index]),
      blueprint: Math.round(blueprintWealth[index]),
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

/**
 * Data point for sensitivity chart
 * Has dynamic keys for each scenario
 */
export interface SensitivityChartPoint {
  age: number;
  [scenarioName: string]: number; // Dynamic keys for each scenario
}

/**
 * Transform sensitivity results into chart-ready format
 * Merges all scenarios into single dataset keyed by age
 */
export function transformToSensitivityChartData(
  result: SensitivityResult
): SensitivityChartPoint[] {
  const ageMap = new Map<number, SensitivityChartPoint>();

  // Build map of age -> scenario values
  for (const [name, scenario] of Object.entries(result.scenarios)) {
    for (const yearData of scenario.blueprint) {
      const existing = ageMap.get(yearData.age);
      if (existing) {
        existing[name] = yearData.netWorth;
      } else {
        ageMap.set(yearData.age, {
          age: yearData.age,
          [name]: yearData.netWorth,
        });
      }
    }
  }

  // Convert to sorted array
  return Array.from(ageMap.values()).sort((a, b) => a.age - b.age);
}
