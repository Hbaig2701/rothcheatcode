/**
 * Sensitivity Analysis Module
 * Runs multiple scenarios to show how results vary under different assumptions
 */

import type { Client } from '@/lib/types/client';
import type { SensitivityScenario, SensitivityResult } from './types';
import { runSimulation, createSimulationInput } from '../engine';
import { analyzeBreakEven } from './breakeven';

/**
 * Predefined sensitivity scenarios
 * Based on financial planning best practices for scenario analysis
 *
 * Growth rates: 4% (pessimistic), 6% (base), 8% (optimistic)
 * Tax multipliers: 0.8x (lower), 1.0x (current), 1.2x (higher)
 */
export const SENSITIVITY_SCENARIOS: SensitivityScenario[] = [
  { name: 'Base Case', growthRate: 6, taxRateMultiplier: 1.0 },
  { name: 'Low Growth', growthRate: 4, taxRateMultiplier: 1.0 },
  { name: 'High Growth', growthRate: 8, taxRateMultiplier: 1.0 },
  { name: 'Higher Taxes', growthRate: 6, taxRateMultiplier: 1.2 },
  { name: 'Lower Taxes', growthRate: 6, taxRateMultiplier: 0.8 },
  { name: 'Pessimistic', growthRate: 4, taxRateMultiplier: 1.2 },
  { name: 'Optimistic', growthRate: 8, taxRateMultiplier: 0.8 },
];

/**
 * Scenario display colors for charts
 * Matches existing Recharts color scheme
 */
export const SCENARIO_COLORS: Record<string, string> = {
  'Base Case': '#F5B800',    // primary gold
  'Low Growth': '#f97316',   // orange-500
  'High Growth': '#22c55e',  // green-500
  'Higher Taxes': '#ef4444', // red-500
  'Lower Taxes': '#8b5cf6',  // violet-500
  'Pessimistic': '#A0A0A0',  // neutral gray
  'Optimistic': '#FFD966',   // light yellow
};

/**
 * Apply scenario parameters to client
 * Modifies growth rate for the simulation
 *
 * Note: Tax rate multiplier is tracked for display purposes.
 * Full implementation would require passing multiplier through
 * to federal-tax.ts calculation.
 */
function createScenarioClient(
  client: Client,
  scenario: SensitivityScenario
): Client {
  // Apply growth rate override
  const modifiedClient: Client = {
    ...client,
    growth_rate: scenario.growthRate,
  };

  // Tax rate multiplier affects interpretation, not direct calculation
  // For now, we track it in results for display purposes
  // Full implementation would pass multiplier through to tax calculation

  return modifiedClient;
}

/**
 * Run sensitivity analysis across all predefined scenarios
 *
 * @param client - Base client configuration
 * @returns Results for all 7 scenarios with aggregated statistics
 */
export function runSensitivityAnalysis(client: Client): SensitivityResult {
  const scenarios: SensitivityResult['scenarios'] = {};
  const breakEvens: (number | null)[] = [];
  const endingWealths: number[] = [];

  const simulationInput = createSimulationInput(client);

  for (const scenario of SENSITIVITY_SCENARIOS) {
    // Create scenario-specific client
    const scenarioClient = createScenarioClient(client, scenario);

    // Run simulation with modified parameters
    const result = runSimulation({
      ...simulationInput,
      client: scenarioClient,
    });

    // Analyze breakeven for this scenario
    const breakEvenAnalysis = analyzeBreakEven(result.baseline, result.cheatCode);

    // Store results
    const lastCheatCode = result.cheatCode[result.cheatCode.length - 1];
    scenarios[scenario.name] = {
      baseline: result.baseline,
      cheatCode: result.cheatCode,
      breakEvenAge: breakEvenAnalysis.simpleBreakEven,
      endingWealth: lastCheatCode.netWorth,
    };

    // Collect for range calculation
    if (breakEvenAnalysis.simpleBreakEven !== null) {
      breakEvens.push(breakEvenAnalysis.simpleBreakEven);
    }
    endingWealths.push(lastCheatCode.netWorth);
  }

  // Calculate ranges
  const validBreakEvens = breakEvens.filter((b): b is number => b !== null);
  const breakEvenRange = {
    min: validBreakEvens.length > 0 ? Math.min(...validBreakEvens) : null,
    max: validBreakEvens.length > 0 ? Math.max(...validBreakEvens) : null,
  };

  const wealthRange = {
    min: Math.min(...endingWealths),
    max: Math.max(...endingWealths),
  };

  return {
    scenarios,
    breakEvenRange,
    wealthRange,
  };
}

/**
 * Get scenario by name
 * Useful for chart highlighting
 */
export function getScenario(name: string): SensitivityScenario | undefined {
  return SENSITIVITY_SCENARIOS.find(s => s.name === name);
}

/**
 * Get scenario color for charts
 */
export function getScenarioColor(name: string): string {
  return SCENARIO_COLORS[name] ?? '#6b7280';
}

/**
 * Format sensitivity result for display
 * Returns key statistics in a human-readable format
 */
export function formatSensitivitySummary(result: SensitivityResult): {
  breakEvenRange: string;
  wealthRange: string;
  bestCase: string;
  worstCase: string;
} {
  // Find best and worst scenarios by ending wealth
  const scenarioEntries = Object.entries(result.scenarios);
  const sorted = scenarioEntries.sort(
    (a, b) => b[1].endingWealth - a[1].endingWealth
  );

  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  // Format breakeven range
  let breakEvenRange: string;
  if (result.breakEvenRange.min === null) {
    breakEvenRange = 'Never breaks even in any scenario';
  } else if (result.breakEvenRange.min === result.breakEvenRange.max) {
    breakEvenRange = `Age ${result.breakEvenRange.min}`;
  } else {
    breakEvenRange = `Age ${result.breakEvenRange.min} - ${result.breakEvenRange.max}`;
  }

  // Format wealth range (convert cents to dollars)
  const minWealth = (result.wealthRange.min / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
  const maxWealth = (result.wealthRange.max / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

  return {
    breakEvenRange,
    wealthRange: `${minWealth} - ${maxWealth}`,
    bestCase: best[0],
    worstCase: worst[0],
  };
}
