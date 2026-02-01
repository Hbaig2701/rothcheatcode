import type { Client } from '@/lib/types/client';
import type { SimulationInput, SimulationResult, YearlyResult } from './types';
import { runBaselineScenario } from './scenarios/baseline';
import { runCheatCodeScenario } from './scenarios/cheatcode';

/**
 * Default heir tax rate per specification (40%)
 * Combined federal + state tax on inherited traditional IRA
 */
const DEFAULT_HEIR_TAX_RATE = 40;

/**
 * Find the break-even age where cheatCode net worth exceeds baseline
 */
function calculateBreakEvenAge(baseline: YearlyResult[], cheatCode: YearlyResult[]): number | null {
  for (let i = 0; i < baseline.length; i++) {
    if (cheatCode[i].netWorth > baseline[i].netWorth) {
      return cheatCode[i].age;
    }
  }
  return null;
}

/**
 * Calculate lifetime tax savings (baseline taxes - cheatCode taxes)
 */
function calculateTaxSavings(baseline: YearlyResult[], cheatCode: YearlyResult[]): number {
  const baselineTotalTax = baseline.reduce((sum, y) => sum + y.totalTax, 0);
  const cheatCodeTotalTax = cheatCode.reduce((sum, y) => sum + y.totalTax, 0);
  return baselineTotalTax - cheatCodeTotalTax;
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
 * - CheatCode: Roth IRA tax-free, Traditional IRA remainder taxed
 */
function calculateHeirBenefit(
  baseline: YearlyResult[],
  cheatCode: YearlyResult[],
  heirTaxRate?: number,
  heirBracket?: string
): number {
  const lastBaseline = baseline[baseline.length - 1];
  const lastCheatCode = cheatCode[cheatCode.length - 1];

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

  // CheatCode legacy calculation
  // Traditional IRA remainder taxed, Roth is tax-free
  const cheatCodeTraditionalLegacy = calculateLegacy(lastCheatCode.traditionalBalance, 'traditional', heirRate);
  const cheatCodeRothLegacy = calculateLegacy(lastCheatCode.rothBalance, 'roth', heirRate);

  // Heir benefit = baseline heir tax - cheatCode heir tax
  const baselineHeirTax = baselineLegacy.taxOnLegacy;
  const cheatCodeHeirTax = cheatCodeTraditionalLegacy.taxOnLegacy + cheatCodeRothLegacy.taxOnLegacy;

  return baselineHeirTax - cheatCodeHeirTax;
}

/**
 * Calculate summary metrics per specification
 */
export interface SummaryMetrics {
  distributions: {
    baseline: number;
    cheatCode: number;
    baselineTax: number;
    cheatCodeTax: number;
    baselineAfterTax: number;
    cheatCodeAfterTax: number;
  };
  irmaa: {
    baseline: number;
    cheatCode: number;
  };
  heirs: {
    baselineGross: number;
    cheatCodeGross: number;
    baselineTax: number;
    cheatCodeTax: number;
    baselineNet: number;
    cheatCodeNet: number;
  };
  wealth: {
    baselineTotalDist: number;
    cheatCodeTotalDist: number;
    baselineTotalCosts: number;
    cheatCodeTotalCosts: number;
    baselineLifetimeWealth: number;
    cheatCodeLifetimeWealth: number;
    increaseAmount: number;
    increasePercentage: number;
  };
}

function calculateSummaryMetrics(
  baseline: YearlyResult[],
  cheatCode: YearlyResult[],
  heirTaxRate: number
): SummaryMetrics {
  const heirRate = heirTaxRate / 100;

  // Sum distributions
  const baselineDistributions = baseline.reduce((sum, y) => sum + y.rmdAmount, 0);
  const cheatCodeDistributions = cheatCode.reduce((sum, y) => sum + y.conversionAmount, 0);

  // Sum taxes on distributions
  const baselineDistTax = baseline.reduce((sum, y) => sum + y.federalTax + y.stateTax, 0);
  const cheatCodeDistTax = cheatCode.reduce((sum, y) => sum + y.federalTax + y.stateTax, 0);

  // After-tax distributions (received by client)
  // For baseline: RMDs after tax are what client receives
  // For cheatCode: conversions are not "received" - they're moved to Roth
  const baselineAfterTaxDist = baselineDistributions - baselineDistTax;
  const cheatCodeAfterTaxDist = 0; // CheatCode: all converted, nothing received during conversion

  // IRMAA totals
  const baselineIRMAA = baseline.reduce((sum, y) => sum + y.irmaaSurcharge, 0);
  const cheatCodeIRMAA = cheatCode.reduce((sum, y) => sum + y.irmaaSurcharge, 0);

  // Final balances
  const lastBaseline = baseline[baseline.length - 1];
  const lastCheatCode = cheatCode[cheatCode.length - 1];

  // Legacy calculations
  const baselineFinal = lastBaseline.traditionalBalance + lastBaseline.rothBalance;
  const cheatCodeFinal = lastCheatCode.traditionalBalance + lastCheatCode.rothBalance;

  // For baseline, all is traditional (taxed to heirs)
  const baselineLegacyTax = Math.round(lastBaseline.traditionalBalance * heirRate);
  const baselineLegacyNet = baselineFinal - baselineLegacyTax;

  // For cheatCode, traditional is taxed, Roth is tax-free
  const cheatCodeLegacyTax = Math.round(lastCheatCode.traditionalBalance * heirRate);
  const cheatCodeLegacyNet = cheatCodeFinal - cheatCodeLegacyTax;

  // Total distributions (client + heirs)
  const baselineTotalDist = baselineDistributions + baselineFinal;
  const cheatCodeTotalDist = cheatCodeDistributions + cheatCodeFinal;

  // Total costs
  const baselineTotalCosts = baselineDistTax + baselineLegacyTax + baselineIRMAA;
  const cheatCodeTotalCosts = cheatCodeDistTax + cheatCodeLegacyTax + cheatCodeIRMAA;

  // Lifetime wealth = Total distributions - Total costs
  const baselineWealth = baselineTotalDist - baselineTotalCosts;
  const cheatCodeWealth = cheatCodeTotalDist - cheatCodeTotalCosts;

  // Difference
  const wealthIncrease = cheatCodeWealth - baselineWealth;
  const wealthIncreasePct = baselineWealth > 0
    ? Math.round((wealthIncrease / baselineWealth) * 100)
    : 0;

  return {
    distributions: {
      baseline: baselineDistributions,
      cheatCode: cheatCodeDistributions,
      baselineTax: baselineDistTax,
      cheatCodeTax: cheatCodeDistTax,
      baselineAfterTax: baselineAfterTaxDist,
      cheatCodeAfterTax: cheatCodeAfterTaxDist
    },
    irmaa: {
      baseline: baselineIRMAA,
      cheatCode: cheatCodeIRMAA
    },
    heirs: {
      baselineGross: baselineFinal,
      cheatCodeGross: cheatCodeFinal,
      baselineTax: baselineLegacyTax,
      cheatCodeTax: cheatCodeLegacyTax,
      baselineNet: baselineLegacyNet,
      cheatCodeNet: cheatCodeLegacyNet
    },
    wealth: {
      baselineTotalDist,
      cheatCodeTotalDist,
      baselineTotalCosts,
      cheatCodeTotalCosts,
      baselineLifetimeWealth: baselineWealth,
      cheatCodeLifetimeWealth: cheatCodeWealth,
      increaseAmount: wealthIncrease,
      increasePercentage: wealthIncreasePct
    }
  };
}

/**
 * Run full simulation comparing Baseline vs CheatCode scenarios
 */
export function runSimulation(input: SimulationInput): SimulationResult {
  const { client, startYear, endYear } = input;
  const projectionYears = endYear - startYear + 1;

  const baseline = runBaselineScenario(client, startYear, projectionYears);
  const cheatCode = runCheatCodeScenario(client, startYear, projectionYears);

  return {
    baseline,
    cheatCode,
    breakEvenAge: calculateBreakEvenAge(baseline, cheatCode),
    totalTaxSavings: calculateTaxSavings(baseline, cheatCode),
    heirBenefit: calculateHeirBenefit(baseline, cheatCode, client.heir_tax_rate, client.heir_bracket)
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

  const metrics = calculateSummaryMetrics(result.baseline, result.cheatCode, heirTaxRate);

  return { result, metrics };
}

/**
 * Create simulation input from client data
 * Supports both new CheatCode form (age + end_age) and legacy form (projection_years)
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
