import type { Client } from '@/lib/types/client';
import type { SimulationInput, SimulationResult, YearlyResult } from './types';
import { runBaselineScenario } from './scenarios/baseline';
import { runGrowthFormulaScenario } from './scenarios/growth-formula';

/**
 * Default heir tax rate (40%)
 */
const DEFAULT_HEIR_TAX_RATE = 40;

/**
 * Find the break-even age where formula net worth exceeds baseline
 */
function calculateBreakEvenAge(baseline: YearlyResult[], formula: YearlyResult[]): number | null {
  for (let i = 0; i < baseline.length && i < formula.length; i++) {
    if (formula[i].netWorth > baseline[i].netWorth) {
      return formula[i].age;
    }
  }
  return null;
}

/**
 * Calculate lifetime tax savings (baseline taxes - formula taxes)
 */
function calculateTaxSavings(baseline: YearlyResult[], formula: YearlyResult[]): number {
  const baselineTotalTax = baseline.reduce((sum, y) => sum + y.totalTax, 0);
  const formulaTotalTax = formula.reduce((sum, y) => sum + y.totalTax, 0);
  return baselineTotalTax - formulaTotalTax;
}

/**
 * Calculate heir benefit
 * - Baseline: Traditional IRA taxed at heir rate
 * - Formula: Roth tax-free + remaining Traditional taxed
 */
function calculateHeirBenefit(
  baseline: YearlyResult[],
  formula: YearlyResult[],
  heirTaxRate: number
): number {
  const lastBaseline = baseline[baseline.length - 1];
  const lastFormula = formula[formula.length - 1];

  const heirRate = heirTaxRate / 100;

  // Baseline: all traditional, taxed at heir rate
  const baselineHeirTax = Math.round(lastBaseline.traditionalBalance * heirRate);

  // Formula: traditional taxed, Roth is tax-free
  const formulaHeirTax = Math.round(lastFormula.traditionalBalance * heirRate);

  // Heir benefit = reduced taxes for heirs
  return baselineHeirTax - formulaHeirTax;
}

/**
 * Run Growth FIA simulation comparing Baseline vs Formula (Roth conversion) scenarios
 *
 * - Baseline: Standard "do nothing" — Traditional IRA with RMDs starting at 73 (same as legacy)
 * - Formula: Growth FIA with upfront bonus, anniversary bonuses, and strategic Roth conversions
 */
export function runGrowthSimulation(input: SimulationInput): SimulationResult {
  const { client, startYear, endYear } = input;
  const projectionYears = endYear - startYear + 1;

  // Baseline uses the STANDARD baseline with RMDs (same as legacy engine)
  const baseline = runBaselineScenario(client, startYear, projectionYears);
  // Formula uses the growth formula with anniversary bonus support
  const formula = runGrowthFormulaScenario(client, startYear, projectionYears);

  const heirTaxRate = client.heir_tax_rate ?? DEFAULT_HEIR_TAX_RATE;

  return {
    baseline,
    formula,
    breakEvenAge: calculateBreakEvenAge(baseline, formula),
    totalTaxSavings: calculateTaxSavings(baseline, formula),
    heirBenefit: calculateHeirBenefit(baseline, formula, heirTaxRate)
  };
}
