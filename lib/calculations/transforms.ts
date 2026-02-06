import { Projection, GIYearlyData } from '@/lib/types/projection';
import { SimulationResult, YearlyResult } from './types';
import type { SensitivityResult } from './analysis/types';

/**
 * Data point for wealth chart
 * Represents net account position over time
 */
export interface ChartDataPoint {
  age: number;
  year: number;
  baseline: number;   // Account balance in cents (Traditional IRA)
  formula: number;    // Net position in cents (Roth - taxes paid - IRMAA)
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
 * Calculate Wealth Trajectory for FORMULA scenario
 *
 * Shows: Account balances minus ONE-TIME taxes paid (not compounding debt)
 *
 * The taxableBalance in the data compounds as "debt" representing opportunity cost,
 * but this creates an unfair comparison since baseline doesn't discount future heir taxes.
 *
 * Instead, we subtract only the INITIAL taxes paid (from year 0) as a constant.
 * This shows the real "payback period" - you paid taxes upfront, Roth grows to recover.
 */
function calculateFormulaLifetimeWealth(years: YearlyResult[]): number[] {
  // Get initial taxes paid from first year (before compounding)
  // taxableBalance is negative, so this gives us a positive number
  const initialTaxesPaid = years.length > 0 ? Math.abs(Math.min(0, years[0].taxableBalance || 0)) : 0;

  return years.map(year => {
    // Account balances minus the one-time tax cost (constant, not compounding)
    return year.traditionalBalance + year.rothBalance - initialTaxesPaid;
  });
}

/**
 * Calculate Wealth Trajectory for BASELINE scenario
 *
 * Shows actual account balances: Traditional + Roth
 * This is the "do nothing" scenario - keep money in Traditional, take RMDs when required.
 *
 * BASELINE: wealth = traditionalBalance + rothBalance
 */
function calculateBaselineLifetimeWealth(
  years: YearlyResult[],
  _heirTaxRate: number = 0.40  // Kept for API compatibility but not used in chart
): number[] {
  return years.map(year => {
    // Show actual retirement account balances
    // For baseline, this is typically just traditionalBalance (no Roth conversions)
    return year.traditionalBalance + year.rothBalance;
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
 * Shows actual retirement account balances over time
 *
 * BASELINE: traditionalBalance + rothBalance
 *   What you'd have if you did nothing (Traditional IRA with RMDs at 73)
 *
 * FORMULA: traditionalBalance + rothBalance
 *   What you'd have after Roth conversions (mostly/all Roth)
 *
 * NOTE: We use actual account balances, NOT netWorth which includes
 * taxableBalance. The taxableBalance compounds as "debt" representing
 * opportunity cost of taxes paid, but baseline doesn't have equivalent
 * treatment for future heir taxes. Using account balances is a fair comparison.
 *
 * Strategy starts lower (you paid conversion taxes from outside funds)
 * but catches up as Roth grows tax-free without RMD depletion.
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
