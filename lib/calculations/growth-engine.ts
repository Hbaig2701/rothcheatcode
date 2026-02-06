import type { Client } from '@/lib/types/client';
import type { SimulationInput, SimulationResult, YearlyResult } from './types';
import { runGrowthBaselineScenario } from './scenarios/growth-baseline';
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
 * Calculate lifetime tax savings (conversion taxes paid)
 * For Growth FIA, this is the total conversion taxes paid during the strategy
 */
function calculateTaxSavings(baseline: YearlyResult[], formula: YearlyResult[]): number {
  // Baseline has no taxes (money just grows)
  // Formula has conversion taxes
  const formulaTotalTax = formula.reduce((sum, y) => sum + y.totalTax, 0);
  return -formulaTotalTax; // Negative because strategy PAYS taxes, doesn't save
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
 * Key differences from standard simulation:
 * - Baseline: Simple compound growth, NO RMDs (money stays in annuity)
 * - Formula: Applies FIA bonuses, strategic Roth conversions, compound growth
 */
export function runGrowthSimulation(input: SimulationInput): SimulationResult {
  const { client, startYear, endYear } = input;
  const projectionYears = endYear - startYear + 1;

  const baseline = runGrowthBaselineScenario(client, startYear, projectionYears);
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
