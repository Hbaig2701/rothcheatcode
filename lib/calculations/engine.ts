import type { Client } from '@/lib/types/client';
import type { SimulationInput, SimulationResult, YearlyResult } from './types';
import { runBaselineScenario } from './scenarios/baseline';
import { runBlueprintScenario } from './scenarios/blueprint';

/**
 * Default heir tax rate per specification (40%)
 * Combined federal + state tax on inherited traditional IRA
 */
const DEFAULT_HEIR_TAX_RATE = 40;

/**
 * Find the break-even age where blueprint net worth exceeds baseline
 */
function calculateBreakEvenAge(baseline: YearlyResult[], blueprint: YearlyResult[]): number | null {
  for (let i = 0; i < baseline.length; i++) {
    if (blueprint[i].netWorth > baseline[i].netWorth) {
      return blueprint[i].age;
    }
  }
  return null;
}

/**
 * Calculate lifetime tax savings (baseline taxes - blueprint taxes)
 */
function calculateTaxSavings(baseline: YearlyResult[], blueprint: YearlyResult[]): number {
  const baselineTotalTax = baseline.reduce((sum, y) => sum + y.totalTax, 0);
  const blueprintTotalTax = blueprint.reduce((sum, y) => sum + y.totalTax, 0);
  return baselineTotalTax - blueprintTotalTax;
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
 * - Blueprint: Roth IRA tax-free, Traditional IRA remainder taxed
 */
function calculateHeirBenefit(
  baseline: YearlyResult[],
  blueprint: YearlyResult[],
  heirTaxRate?: number,
  heirBracket?: string
): number {
  const lastBaseline = baseline[baseline.length - 1];
  const lastBlueprint = blueprint[blueprint.length - 1];

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

  // Blueprint legacy calculation
  // Traditional IRA remainder taxed, Roth is tax-free
  const blueprintTraditionalLegacy = calculateLegacy(lastBlueprint.traditionalBalance, 'traditional', heirRate);
  const blueprintRothLegacy = calculateLegacy(lastBlueprint.rothBalance, 'roth', heirRate);

  // Heir benefit = baseline heir tax - blueprint heir tax
  const baselineHeirTax = baselineLegacy.taxOnLegacy;
  const blueprintHeirTax = blueprintTraditionalLegacy.taxOnLegacy + blueprintRothLegacy.taxOnLegacy;

  return baselineHeirTax - blueprintHeirTax;
}

/**
 * Calculate summary metrics per specification
 */
export interface SummaryMetrics {
  distributions: {
    baseline: number;
    blueprint: number;
    baselineTax: number;
    blueprintTax: number;
    baselineAfterTax: number;
    blueprintAfterTax: number;
  };
  irmaa: {
    baseline: number;
    blueprint: number;
  };
  heirs: {
    baselineGross: number;
    blueprintGross: number;
    baselineTax: number;
    blueprintTax: number;
    baselineNet: number;
    blueprintNet: number;
  };
  wealth: {
    baselineTotalDist: number;
    blueprintTotalDist: number;
    baselineTotalCosts: number;
    blueprintTotalCosts: number;
    baselineLifetimeWealth: number;
    blueprintLifetimeWealth: number;
    increaseAmount: number;
    increasePercentage: number;
  };
}

function calculateSummaryMetrics(
  baseline: YearlyResult[],
  blueprint: YearlyResult[],
  heirTaxRate: number
): SummaryMetrics {
  const heirRate = heirTaxRate / 100;

  // Sum distributions
  const baselineDistributions = baseline.reduce((sum, y) => sum + y.rmdAmount, 0);
  const blueprintDistributions = blueprint.reduce((sum, y) => sum + y.conversionAmount, 0);

  // Sum taxes on distributions
  const baselineDistTax = baseline.reduce((sum, y) => sum + y.federalTax + y.stateTax, 0);
  const blueprintDistTax = blueprint.reduce((sum, y) => sum + y.federalTax + y.stateTax, 0);

  // After-tax distributions (received by client)
  // For baseline: RMDs after tax are what client receives
  // For blueprint: conversions are not "received" - they're moved to Roth
  const baselineAfterTaxDist = baselineDistributions - baselineDistTax;
  const blueprintAfterTaxDist = 0; // Blueprint: all converted, nothing received during conversion

  // IRMAA totals
  const baselineIRMAA = baseline.reduce((sum, y) => sum + y.irmaaSurcharge, 0);
  const blueprintIRMAA = blueprint.reduce((sum, y) => sum + y.irmaaSurcharge, 0);

  // Final balances
  const lastBaseline = baseline[baseline.length - 1];
  const lastBlueprint = blueprint[blueprint.length - 1];

  // Legacy calculations
  const baselineFinal = lastBaseline.traditionalBalance + lastBaseline.rothBalance;
  const blueprintFinal = lastBlueprint.traditionalBalance + lastBlueprint.rothBalance;

  // For baseline, all is traditional (taxed to heirs)
  const baselineLegacyTax = Math.round(lastBaseline.traditionalBalance * heirRate);
  const baselineLegacyNet = baselineFinal - baselineLegacyTax;

  // For blueprint, traditional is taxed, Roth is tax-free
  const blueprintLegacyTax = Math.round(lastBlueprint.traditionalBalance * heirRate);
  const blueprintLegacyNet = blueprintFinal - blueprintLegacyTax;

  // Total distributions (client + heirs)
  const baselineTotalDist = baselineDistributions + baselineFinal;
  const blueprintTotalDist = blueprintDistributions + blueprintFinal;

  // Total costs
  const baselineTotalCosts = baselineDistTax + baselineLegacyTax + baselineIRMAA;
  const blueprintTotalCosts = blueprintDistTax + blueprintLegacyTax + blueprintIRMAA;

  // Lifetime wealth = Total distributions - Total costs
  const baselineWealth = baselineTotalDist - baselineTotalCosts;
  const blueprintWealth = blueprintTotalDist - blueprintTotalCosts;

  // Difference
  const wealthIncrease = blueprintWealth - baselineWealth;
  const wealthIncreasePct = baselineWealth > 0
    ? Math.round((wealthIncrease / baselineWealth) * 100)
    : 0;

  return {
    distributions: {
      baseline: baselineDistributions,
      blueprint: blueprintDistributions,
      baselineTax: baselineDistTax,
      blueprintTax: blueprintDistTax,
      baselineAfterTax: baselineAfterTaxDist,
      blueprintAfterTax: blueprintAfterTaxDist
    },
    irmaa: {
      baseline: baselineIRMAA,
      blueprint: blueprintIRMAA
    },
    heirs: {
      baselineGross: baselineFinal,
      blueprintGross: blueprintFinal,
      baselineTax: baselineLegacyTax,
      blueprintTax: blueprintLegacyTax,
      baselineNet: baselineLegacyNet,
      blueprintNet: blueprintLegacyNet
    },
    wealth: {
      baselineTotalDist,
      blueprintTotalDist,
      baselineTotalCosts,
      blueprintTotalCosts,
      baselineLifetimeWealth: baselineWealth,
      blueprintLifetimeWealth: blueprintWealth,
      increaseAmount: wealthIncrease,
      increasePercentage: wealthIncreasePct
    }
  };
}

/**
 * Run full simulation comparing Baseline vs Blueprint scenarios
 */
export function runSimulation(input: SimulationInput): SimulationResult {
  const { client, startYear, endYear } = input;
  const projectionYears = endYear - startYear + 1;

  const baseline = runBaselineScenario(client, startYear, projectionYears);
  const blueprint = runBlueprintScenario(client, startYear, projectionYears);

  return {
    baseline,
    blueprint,
    breakEvenAge: calculateBreakEvenAge(baseline, blueprint),
    totalTaxSavings: calculateTaxSavings(baseline, blueprint),
    heirBenefit: calculateHeirBenefit(baseline, blueprint, client.heir_tax_rate, client.heir_bracket)
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

  const metrics = calculateSummaryMetrics(result.baseline, result.blueprint, heirTaxRate);

  return { result, metrics };
}

/**
 * Create simulation input from client data
 * Supports both new Blueprint form (age + end_age) and legacy form (projection_years)
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
