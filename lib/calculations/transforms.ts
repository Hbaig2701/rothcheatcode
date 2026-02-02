import { Projection, GIYearlyData } from '@/lib/types/projection';
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
  formula: number;  // Lifetime wealth in cents
}

/**
 * Summary metrics for stat cards
 */
export interface SummaryMetrics {
  baselineEndWealth: number;    // Final year netWorth, cents
  formulaEndWealth: number;   // Final year netWorth, cents
  difference: number;           // formula - baseline, cents
  totalTaxSavings: number;      // From projection, cents
  breakEvenAge: number | null;  // Age where formula exceeds baseline
  heirBenefit: number;          // Benefit to heirs, cents
}

/**
 * Type guard to check if input is a Projection (from database)
 */
function isProjection(input: Projection | SimulationResult): input is Projection {
  return 'baseline_years' in input && 'blueprint_years' in input;
}

/**
 * Calculate Lifetime Wealth Trajectory for FORMULA scenario
 *
 * FORMULA: lifetimeWealth = eoy_combined - cumulativeConversionTaxes - cumulativeIRMAA
 *
 * Conversions are NOT distributions (money stays in account, just moves from Traditional to Roth).
 * But conversion taxes ARE costs. Roth passes to heirs tax-free.
 */
function calculateFormulaLifetimeWealth(years: YearlyResult[]): number[] {
  let cumulativeTaxes = 0;
  let cumulativeIRMAA = 0;

  return years.map(year => {
    // Accumulate taxes paid on conversions
    cumulativeTaxes += (year.federalTax + year.stateTax) || 0;

    // Accumulate IRMAA surcharges
    cumulativeIRMAA += year.irmaaSurcharge || 0;

    // Formula: Full account balance (Roth = no heir tax) minus costs paid
    return year.netWorth - cumulativeTaxes - cumulativeIRMAA;
  });
}

/**
 * Calculate Lifetime Wealth Trajectory for BASELINE scenario
 *
 * BASELINE: lifetimeWealth = (eoy_combined * 0.60) + cumulativeAfterTaxDistributions - cumulativeIRMAA
 *
 * RMDs ARE actual distributions the client receives and can spend.
 * Legacy is reduced by 40% heir tax on Traditional IRA.
 */
function calculateBaselineLifetimeWealth(
  years: YearlyResult[],
  heirTaxRate: number = 0.40
): number[] {
  let cumulativeAfterTaxDist = 0;
  let cumulativeIRMAA = 0;

  return years.map(year => {
    // RMDs are actual distributions - calculate after-tax amount received
    const rmdAfterTax = year.rmdAmount - (year.federalTax + year.stateTax);
    cumulativeAfterTaxDist += rmdAfterTax;

    // Accumulate IRMAA surcharges
    cumulativeIRMAA += year.irmaaSurcharge || 0;

    // Baseline: Legacy at 60% (heir pays 40% tax) + cumulative distributions received - IRMAA
    const netLegacy = year.netWorth * (1 - heirTaxRate);
    return netLegacy + cumulativeAfterTaxDist - cumulativeIRMAA;
  });
}

/**
 * Calculate Lifetime Wealth Trajectory for GI FORMULA scenario
 *
 * GI Formula:
 *   lifetimeWealth = cumulativeNetGIPayments
 *                  + netLegacy (accountValue * (1 - heirTaxRate) + rothBalance)
 *                  - cumulativeConversionTaxes (deferral phase only)
 *                  - cumulativeIRMAA
 *
 * During deferral: taxes are conversion taxes (cost). No income received.
 * During income: after-tax GI payments are income. Taxes on GI already excluded from net.
 */
function calculateGIFormulaLifetimeWealth(
  formulaYears: YearlyResult[],
  giYearlyData: GIYearlyData[],
  heirTaxRate: number = 0.40
): number[] {
  let cumulativeNetGI = 0;
  let cumulativeConversionTaxes = 0;
  let cumulativeIRMAA = 0;

  return formulaYears.map((year, index) => {
    const giYear = giYearlyData[index];

    cumulativeIRMAA += year.irmaaSurcharge || 0;

    if (giYear && giYear.phase === 'deferral') {
      // Deferral: federalTax + stateTax are conversion taxes
      cumulativeConversionTaxes += (year.federalTax + year.stateTax) || 0;
    } else if (giYear && giYear.phase === 'income') {
      // Income: accumulate after-tax GI payments
      cumulativeNetGI += giYear.guaranteedIncomeNet;
    }

    // Legacy: account value (annuity) taxed at heir rate, Roth is tax-free
    const netLegacy = Math.round(year.traditionalBalance * (1 - heirTaxRate)) + year.rothBalance;

    return cumulativeNetGI + netLegacy - cumulativeConversionTaxes - cumulativeIRMAA;
  });
}

/**
 * Transform GI projection data into chart-ready format
 * Uses GI-specific Formula wealth calculation and standard baseline calculation
 */
export function transformToGIChartData(projection: Projection): ChartDataPoint[] {
  const baselineWealth = calculateBaselineLifetimeWealth(projection.baseline_years);
  const formulaWealth = calculateGIFormulaLifetimeWealth(
    projection.blueprint_years,
    projection.gi_yearly_data || [],
  );

  return projection.baseline_years.map((baseYear, index) => ({
    age: baseYear.age,
    year: baseYear.year,
    baseline: Math.round(baselineWealth[index]),
    formula: Math.round(formulaWealth[index]),
  }));
}

/**
 * Transform projection data into chart-ready format
 * Calculates Lifetime Wealth Trajectory for both scenarios
 *
 * Lifetime Wealth represents "if I died at this age, what would my total lifetime wealth be?"
 *
 * FORMULA: eoy_combined - cumulativeTaxes - cumulativeIRMAA
 *   (Roth passes tax-free, conversions aren't distributions but taxes are costs)
 *
 * BASELINE: (eoy_combined * 0.60) + cumulativeAfterTaxDistributions - cumulativeIRMAA
 *   (Traditional has 40% heir tax, RMDs are actual distributions received)
 *
 * Accepts either database Projection or in-memory SimulationResult
 */
export function transformToChartData(data: Projection | SimulationResult): ChartDataPoint[] {
  if (isProjection(data)) {
    // Database Projection (snake_case)
    const baselineYears = data.baseline_years;
    const formulaYears = data.blueprint_years;

    const baselineWealth = calculateBaselineLifetimeWealth(baselineYears);
    const formulaWealth = calculateFormulaLifetimeWealth(formulaYears);

    return baselineYears.map((baseYear, index) => ({
      age: baseYear.age,
      year: baseYear.year,
      baseline: Math.round(baselineWealth[index]),
      formula: Math.round(formulaWealth[index]),
    }));
  } else {
    // In-memory SimulationResult (camelCase)
    const { baseline, formula } = data;

    const baselineWealth = calculateBaselineLifetimeWealth(baseline);
    const formulaWealth = calculateFormulaLifetimeWealth(formula);

    return baseline.map((baseYear, index) => ({
      age: baseYear.age,
      year: baseYear.year,
      baseline: Math.round(baselineWealth[index]),
      formula: Math.round(formulaWealth[index]),
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
      formulaEndWealth: data.blueprint_final_net_worth,
      difference: data.blueprint_final_net_worth - data.baseline_final_net_worth,
      totalTaxSavings: data.total_tax_savings,
      breakEvenAge: data.break_even_age,
      heirBenefit: data.heir_benefit,
    };
  } else {
    // In-memory SimulationResult - extract from arrays
    const lastBaseline = data.baseline[data.baseline.length - 1];
    const lastFormula = data.formula[data.formula.length - 1];

    return {
      baselineEndWealth: lastBaseline.netWorth,
      formulaEndWealth: lastFormula.netWorth,
      difference: lastFormula.netWorth - lastBaseline.netWorth,
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
    for (const yearData of scenario.formula) {
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
