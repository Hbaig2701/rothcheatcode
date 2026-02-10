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
 * Calculate "Legacy to Heirs" Trajectory for FORMULA scenario
 *
 * Shows what heirs ACTUALLY receive after taxes:
 * - Traditional IRA: taxed at heir rate (40%), so heirs get 60%
 * - Roth IRA: 100% tax-free to heirs
 * - Cash/Taxable: passes through (if positive)
 *
 * This creates dramatic visual disparity because Roth conversions move money
 * from 60%-to-heirs (Traditional) to 100%-to-heirs (Roth).
 */
function calculateFormulaLegacyToHeirs(years: YearlyResult[], heirTaxRate: number = 0.40): number[] {
  return years.map(year => {
    const traditionalToHeirs = Math.round(year.traditionalBalance * (1 - heirTaxRate));
    const rothToHeirs = year.rothBalance;
    const cashToHeirs = Math.max(0, year.taxableBalance || 0);
    return traditionalToHeirs + rothToHeirs + cashToHeirs;
  });
}

/**
 * Calculate "Legacy to Heirs" Trajectory for BASELINE scenario
 *
 * Shows what heirs would receive if client does nothing:
 * - Traditional IRA: taxed at 40% heir rate, so heirs get 60%
 * - Roth IRA: 100% tax-free (usually $0 in baseline)
 * - Cash/Taxable: passes through (RMD proceeds minus taxes)
 *
 * This line is LOWER because Traditional IRA gets 40% haircut.
 */
function calculateBaselineLegacyToHeirs(years: YearlyResult[], heirTaxRate: number = 0.40): number[] {
  return years.map(year => {
    const traditionalToHeirs = Math.round(year.traditionalBalance * (1 - heirTaxRate));
    const rothToHeirs = year.rothBalance;
    const cashToHeirs = Math.max(0, year.taxableBalance || 0);
    return traditionalToHeirs + rothToHeirs + cashToHeirs;
  });
}

/**
 * Calculate Lifetime Wealth Trajectory for GI FORMULA scenario
 *
 * GI 4-Phase Model:
 *   Phase 1 (conversion): Traditional → Roth, taxes paid
 *   Phase 2 (purchase): Roth → GI FIA
 *   Phase 3 (deferral): Income Base grows via roll-up
 *   Phase 4 (income): Tax-free GI payments
 *
 * lifetimeWealth = cumulativeNetGIPayments
 *                + netLegacy (accountValue + rothBalance + taxableBalance)
 *                - cumulativeConversionTaxes
 *                - cumulativeIRMAA
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

    if (giYear) {
      if (giYear.phase === 'conversion') {
        // Conversion phase: federalTax + stateTax are conversion taxes
        cumulativeConversionTaxes += giYear.conversionTax || 0;
      } else if (giYear.phase === 'income') {
        // Income phase: accumulate after-tax GI payments (tax-free from Roth!)
        cumulativeNetGI += giYear.guaranteedIncomeNet;
      }
    }

    // Legacy calculation depends on phase
    let netLegacy = 0;
    if (giYear && (giYear.phase === 'conversion' || giYear.phase === 'purchase')) {
      // Before GI purchase: Track Traditional + Roth + Taxable
      netLegacy = Math.round(giYear.traditionalBalance * (1 - heirTaxRate))
                + giYear.rothBalance
                + (year.taxableBalance || 0);
    } else if (giYear && (giYear.phase === 'deferral' || giYear.phase === 'income')) {
      // After GI purchase: Account value (in Roth, so no heir tax) + Taxable
      netLegacy = giYear.accountValue + (year.taxableBalance || 0);
    } else {
      // Fallback
      netLegacy = Math.round(year.traditionalBalance * (1 - heirTaxRate)) + year.rothBalance;
    }

    return cumulativeNetGI + netLegacy - cumulativeConversionTaxes - cumulativeIRMAA;
  });
}

/**
 * Transform GI projection data into chart-ready format
 * Uses GI-specific Formula wealth calculation and Legacy to Heirs for baseline
 */
export function transformToGIChartData(projection: Projection, heirTaxRate: number = 0.40): ChartDataPoint[] {
  const baselineLegacy = calculateBaselineLegacyToHeirs(projection.baseline_years, heirTaxRate);
  const formulaWealth = calculateGIFormulaLifetimeWealth(
    projection.blueprint_years,
    projection.gi_yearly_data || [],
    heirTaxRate
  );

  return projection.baseline_years.map((baseYear, index) => ({
    age: baseYear.age,
    year: baseYear.year,
    baseline: Math.round(baselineLegacy[index]),
    formula: Math.round(formulaWealth[index]),
  }));
}

/**
 * Transform projection data into chart-ready format
 * Shows "Legacy to Heirs" - what heirs actually receive after taxes
 *
 * BASELINE: Traditional × 60% + Roth + Cash
 *   Heirs only get 60% of Traditional (40% heir tax)
 *
 * FORMULA: Traditional × 60% + Roth + Cash
 *   Roth passes 100% tax-free, creating dramatic visual benefit
 *
 * Example: $1M Traditional → $600K to heirs
 *          $1M Roth → $1M to heirs (67% more!)
 *
 * Accepts either database Projection or in-memory SimulationResult
 */
export function transformToChartData(data: Projection | SimulationResult, heirTaxRate: number = 0.40): ChartDataPoint[] {
  if (isProjection(data)) {
    // Database Projection (snake_case)
    const baselineYears = data.baseline_years;
    const formulaYears = data.blueprint_years;

    const baselineLegacy = calculateBaselineLegacyToHeirs(baselineYears, heirTaxRate);
    const formulaLegacy = calculateFormulaLegacyToHeirs(formulaYears, heirTaxRate);

    return baselineYears.map((baseYear, index) => ({
      age: baseYear.age,
      year: baseYear.year,
      baseline: Math.round(baselineLegacy[index]),
      formula: Math.round(formulaLegacy[index]),
    }));
  } else {
    // In-memory SimulationResult (camelCase)
    const { baseline, formula } = data;

    const baselineLegacy = calculateBaselineLegacyToHeirs(baseline, heirTaxRate);
    const formulaLegacy = calculateFormulaLegacyToHeirs(formula, heirTaxRate);

    return baseline.map((baseYear, index) => ({
      age: baseYear.age,
      year: baseYear.year,
      baseline: Math.round(baselineLegacy[index]),
      formula: Math.round(formulaLegacy[index]),
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
 * Data point for GI cumulative income chart
 * Shows running total of income received over time
 */
export interface GIIncomeChartPoint {
  age: number;
  year: number;
  strategyNet: number;        // Cumulative tax-free income (cents)
  baselineNet: number;        // Cumulative after-tax income (cents)
  strategyAnnual: number;     // Annual income (for tooltip)
  baselineAnnual: number;     // Annual baseline income (for tooltip)
  phase: 'conversion' | 'deferral' | 'income';
}

/**
 * Transform GI projection into cumulative income chart data
 * Shows running total of net income received: Strategy (tax-free) vs Baseline (after-tax)
 */
export function transformToGIIncomeChartData(projection: Projection): GIIncomeChartPoint[] {
  const giYearlyData = projection.gi_yearly_data || [];
  const baselineGIData = projection.gi_baseline_yearly_data || [];

  let cumulativeStrategy = 0;
  let cumulativeBaseline = 0;

  // During conversion phase, strategy has "negative" progress (tax paid)
  // We'll track this but not show negative values
  let conversionTaxPaid = 0;

  return giYearlyData.map((giYear, index) => {
    const baselineYear = baselineGIData[index];

    // Track conversion taxes paid (this is the "investment")
    if (giYear.phase === 'conversion') {
      conversionTaxPaid += giYear.conversionTax || 0;
    }

    // Track cumulative income during income phase
    if (giYear.phase === 'income') {
      cumulativeStrategy += giYear.guaranteedIncomeNet || 0;
      cumulativeBaseline += baselineYear?.guaranteedIncomeNet || 0;
    }

    return {
      age: giYear.age,
      year: giYear.year,
      strategyNet: cumulativeStrategy,
      baselineNet: cumulativeBaseline,
      strategyAnnual: giYear.guaranteedIncomeNet || 0,
      baselineAnnual: baselineYear?.guaranteedIncomeNet || 0,
      phase: giYear.phase as 'conversion' | 'deferral' | 'income',
    };
  });
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
