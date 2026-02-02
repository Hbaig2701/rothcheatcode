import type { Client } from '@/lib/types/client';
import type { SimulationInput, SimulationResult, YearlyResult } from './types';
import { runBaselineScenario } from './scenarios/baseline';
import { runFormulaScenario } from './scenarios/formula';

/**
 * Default heir tax rate per specification (40%)
 * Combined federal + state tax on inherited traditional IRA
 */
const DEFAULT_HEIR_TAX_RATE = 40;

/**
 * Find the break-even age where formula net worth exceeds baseline
 */
function calculateBreakEvenAge(baseline: YearlyResult[], formula: YearlyResult[]): number | null {
  for (let i = 0; i < baseline.length; i++) {
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
 * Calculate legacy/inheritance values and heir benefit
 *
 * Per specification:
 * - Traditional IRA: Heirs pay heir_tax_rate (default 40%)
 * - Roth IRA: Heirs pay $0 (tax-free inheritance)
 */
function calculateLegacy(
  finalBalance: number,
  accountType: 'traditional' | 'roth',
  heirTaxRate: number
): { grossLegacy: number; taxOnLegacy: number; netLegacy: number } {
  if (accountType === 'roth') {
    return {
      grossLegacy: finalBalance,
      taxOnLegacy: 0,
      netLegacy: finalBalance
    };
  } else {
    const taxOnLegacy = Math.round(finalBalance * heirTaxRate);
    return {
      grossLegacy: finalBalance,
      taxOnLegacy,
      netLegacy: finalBalance - taxOnLegacy
    };
  }
}

/**
 * Calculate heir benefit (tax savings for heirs)
 *
 * Per specification:
 * - Baseline: Traditional IRA taxed at heir_tax_rate
 * - Formula: Roth IRA tax-free, Traditional IRA remainder taxed
 */
function calculateHeirBenefit(
  baseline: YearlyResult[],
  formula: YearlyResult[],
  heirTaxRate?: number,
  heirBracket?: string
): number {
  const lastBaseline = baseline[baseline.length - 1];
  const lastFormula = formula[formula.length - 1];

  // Use heir_tax_rate if available, otherwise parse heir_bracket, default to 40%
  let heirRate: number;
  if (heirTaxRate !== undefined && heirTaxRate > 0) {
    heirRate = heirTaxRate / 100;
  } else if (heirBracket) {
    heirRate = parseInt(heirBracket, 10) / 100 || DEFAULT_HEIR_TAX_RATE / 100;
  } else {
    heirRate = DEFAULT_HEIR_TAX_RATE / 100;
  }

  // Baseline legacy calculation
  // All traditional IRA balance is taxed to heirs
  const baselineLegacy = calculateLegacy(lastBaseline.traditionalBalance, 'traditional', heirRate);

  // Formula legacy calculation
  // Traditional IRA remainder taxed, Roth is tax-free
  const formulaTraditionalLegacy = calculateLegacy(lastFormula.traditionalBalance, 'traditional', heirRate);
  const formulaRothLegacy = calculateLegacy(lastFormula.rothBalance, 'roth', heirRate);

  // Heir benefit = baseline heir tax - formula heir tax
  const baselineHeirTax = baselineLegacy.taxOnLegacy;
  const formulaHeirTax = formulaTraditionalLegacy.taxOnLegacy + formulaRothLegacy.taxOnLegacy;

  return baselineHeirTax - formulaHeirTax;
}

/**
 * Calculate summary metrics per specification
 */
export interface SummaryMetrics {
  distributions: {
    baseline: number;
    formula: number;
    baselineTax: number;
    formulaTax: number;
    baselineAfterTax: number;
    formulaAfterTax: number;
  };
  irmaa: {
    baseline: number;
    formula: number;
  };
  heirs: {
    baselineGross: number;
    formulaGross: number;
    baselineTax: number;
    formulaTax: number;
    baselineNet: number;
    formulaNet: number;
  };
  wealth: {
    baselineTotalDist: number;
    formulaTotalDist: number;
    baselineTotalCosts: number;
    formulaTotalCosts: number;
    baselineLifetimeWealth: number;
    formulaLifetimeWealth: number;
    increaseAmount: number;
    increasePercentage: number;
  };
}

function calculateSummaryMetrics(
  baseline: YearlyResult[],
  formula: YearlyResult[],
  heirTaxRate: number
): SummaryMetrics {
  const heirRate = heirTaxRate / 100;

  // Sum distributions
  const baselineDistributions = baseline.reduce((sum, y) => sum + y.rmdAmount, 0);
  const formulaDistributions = formula.reduce((sum, y) => sum + y.conversionAmount, 0);

  // Sum taxes on distributions
  const baselineDistTax = baseline.reduce((sum, y) => sum + y.federalTax + y.stateTax, 0);
  const formulaDistTax = formula.reduce((sum, y) => sum + y.federalTax + y.stateTax, 0);

  // After-tax distributions (received by client)
  // For baseline: RMDs after tax are what client receives
  // For formula: conversions are not "received" - they're moved to Roth
  const baselineAfterTaxDist = baselineDistributions - baselineDistTax;
  const formulaAfterTaxDist = 0; // Formula: all converted, nothing received during conversion

  // IRMAA totals
  const baselineIRMAA = baseline.reduce((sum, y) => sum + y.irmaaSurcharge, 0);
  const formulaIRMAA = formula.reduce((sum, y) => sum + y.irmaaSurcharge, 0);

  // Final balances
  const lastBaseline = baseline[baseline.length - 1];
  const lastFormula = formula[formula.length - 1];

  // Legacy calculations
  const baselineFinal = lastBaseline.traditionalBalance + lastBaseline.rothBalance;
  const formulaFinal = lastFormula.traditionalBalance + lastFormula.rothBalance;

  // For baseline, all is traditional (taxed to heirs)
  const baselineLegacyTax = Math.round(lastBaseline.traditionalBalance * heirRate);
  const baselineLegacyNet = baselineFinal - baselineLegacyTax;

  // For formula, traditional is taxed, Roth is tax-free
  const formulaLegacyTax = Math.round(lastFormula.traditionalBalance * heirRate);
  const formulaLegacyNet = formulaFinal - formulaLegacyTax;

  // Total distributions (client + heirs)
  const baselineTotalDist = baselineDistributions + baselineFinal;
  const formulaTotalDist = formulaDistributions + formulaFinal;

  // Total costs
  const baselineTotalCosts = baselineDistTax + baselineLegacyTax + baselineIRMAA;
  const formulaTotalCosts = formulaDistTax + formulaLegacyTax + formulaIRMAA;

  // Lifetime wealth = Total distributions - Total costs
  const baselineWealth = baselineTotalDist - baselineTotalCosts;
  const formulaWealth = formulaTotalDist - formulaTotalCosts;

  // Difference
  const wealthIncrease = formulaWealth - baselineWealth;
  const wealthIncreasePct = baselineWealth > 0
    ? Math.round((wealthIncrease / baselineWealth) * 100)
    : 0;

  return {
    distributions: {
      baseline: baselineDistributions,
      formula: formulaDistributions,
      baselineTax: baselineDistTax,
      formulaTax: formulaDistTax,
      baselineAfterTax: baselineAfterTaxDist,
      formulaAfterTax: formulaAfterTaxDist
    },
    irmaa: {
      baseline: baselineIRMAA,
      formula: formulaIRMAA
    },
    heirs: {
      baselineGross: baselineFinal,
      formulaGross: formulaFinal,
      baselineTax: baselineLegacyTax,
      formulaTax: formulaLegacyTax,
      baselineNet: baselineLegacyNet,
      formulaNet: formulaLegacyNet
    },
    wealth: {
      baselineTotalDist,
      formulaTotalDist,
      baselineTotalCosts,
      formulaTotalCosts,
      baselineLifetimeWealth: baselineWealth,
      formulaLifetimeWealth: formulaWealth,
      increaseAmount: wealthIncrease,
      increasePercentage: wealthIncreasePct
    }
  };
}

/**
 * Run full simulation comparing Baseline vs Formula scenarios
 */
export function runSimulation(input: SimulationInput): SimulationResult {
  const { client, startYear, endYear } = input;
  const projectionYears = endYear - startYear + 1;

  const baseline = runBaselineScenario(client, startYear, projectionYears);
  const formula = runFormulaScenario(client, startYear, projectionYears);

  return {
    baseline,
    formula,
    breakEvenAge: calculateBreakEvenAge(baseline, formula),
    totalTaxSavings: calculateTaxSavings(baseline, formula),
    heirBenefit: calculateHeirBenefit(baseline, formula, client.heir_tax_rate, client.heir_bracket)
  };
}

/**
 * Run simulation and get summary metrics
 */
export function runSimulationWithMetrics(input: SimulationInput): {
  result: SimulationResult;
  metrics: SummaryMetrics;
} {
  const result = runSimulation(input);

  // Get heir tax rate (default 40%)
  const heirTaxRate = input.client.heir_tax_rate ??
    (input.client.heir_bracket ? parseInt(input.client.heir_bracket, 10) : DEFAULT_HEIR_TAX_RATE);

  const metrics = calculateSummaryMetrics(result.baseline, result.formula, heirTaxRate);

  return { result, metrics };
}

/**
 * Create simulation input from client data
 * Supports both new Formula form (age + end_age) and legacy form (projection_years)
 */
export function createSimulationInput(client: Client): SimulationInput {
  const currentYear = new Date().getFullYear();

  // Calculate projection years: prefer (end_age - age) if both are available
  let projectionYears: number;
  if (client.age && client.end_age) {
    projectionYears = client.end_age - client.age;
  } else {
    projectionYears = client.projection_years ?? 30;
  }

  return {
    client,
    startYear: currentYear,
    endYear: currentYear + projectionYears
  };
}

// Re-export for convenience
export { calculateLegacy, calculateSummaryMetrics };
