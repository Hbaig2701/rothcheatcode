import type { Client } from '@/lib/types/client';
import type { SimulationInput, SimulationResult, YearlyResult } from './types';
import { runBaselineScenario } from './scenarios/baseline';
import { runBlueprintScenario } from './scenarios/blueprint';

function calculateBreakEvenAge(baseline: YearlyResult[], blueprint: YearlyResult[]): number | null {
  for (let i = 0; i < baseline.length; i++) {
    if (blueprint[i].netWorth > baseline[i].netWorth) {
      return blueprint[i].age;
    }
  }
  return null;
}

function calculateTaxSavings(baseline: YearlyResult[], blueprint: YearlyResult[]): number {
  const baselineTotalTax = baseline.reduce((sum, y) => sum + y.totalTax, 0);
  const blueprintTotalTax = blueprint.reduce((sum, y) => sum + y.totalTax, 0);
  return baselineTotalTax - blueprintTotalTax;
}

function calculateHeirBenefit(
  baseline: YearlyResult[],
  blueprint: YearlyResult[],
  heirTaxRate?: number,
  heirBracket?: string
): number {
  const lastBaseline = baseline[baseline.length - 1];
  const lastBlueprint = blueprint[blueprint.length - 1];

  // Use heir_tax_rate if available, otherwise parse heir_bracket, default to 32%
  let heirRate: number;
  if (heirTaxRate !== undefined && heirTaxRate > 0) {
    heirRate = heirTaxRate / 100;
  } else if (heirBracket) {
    heirRate = parseInt(heirBracket, 10) / 100 || 0.32;
  } else {
    heirRate = 0.32;
  }

  const baselineHeirTax = Math.round(lastBaseline.traditionalBalance * heirRate);
  const blueprintHeirTax = Math.round(lastBlueprint.traditionalBalance * heirRate);

  return baselineHeirTax - blueprintHeirTax;
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
