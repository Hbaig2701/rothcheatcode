import { Client } from '@/lib/types/client';
import {
  SimulationResult,
  MultiStrategyResult,
  StrategyType,
  StrategyComparisonMetrics
} from './types';
import { runSimulation } from './engine';
import { STRATEGIES, STRATEGY_PRIORITY } from './strategy-definitions';

/**
 * Extract comparison metrics from a simulation result
 */
function extractComparisonMetrics(result: SimulationResult): StrategyComparisonMetrics {
  const lastYear = result.formula[result.formula.length - 1];

  return {
    endingWealth: lastYear.netWorth,
    taxSavings: result.totalTaxSavings,
    breakEvenAge: result.breakEvenAge,
    totalIRMAA: result.formula.reduce(
      (sum, year) => sum + year.irmaaSurcharge,
      0
    ),
    heirBenefit: result.heirBenefit,
    totalConversions: result.formula.reduce(
      (sum, year) => sum + year.conversionAmount,
      0
    )
  };
}

/**
 * Determine the best strategy based on ending wealth with tie-breakers
 *
 * Primary: Highest ending net worth
 * Tie-breaker 1: Lowest IRMAA surcharges
 * Tie-breaker 2: Lowest risk (STRATEGY_PRIORITY order)
 */
function determineBestStrategy(
  results: Record<StrategyType, SimulationResult>
): StrategyType {
  // Build ranked list
  const ranked = Object.entries(results)
    .map(([strategy, result]) => {
      const lastYear = result.formula[result.formula.length - 1];
      return {
        strategy: strategy as StrategyType,
        wealth: lastYear.netWorth,
        irmaa: result.formula.reduce((s, y) => s + y.irmaaSurcharge, 0)
      };
    })
    .sort((a, b) => {
      // Primary: highest wealth (descending)
      if (b.wealth !== a.wealth) return b.wealth - a.wealth;

      // Tie-breaker 1: lowest IRMAA (ascending)
      if (a.irmaa !== b.irmaa) return a.irmaa - b.irmaa;

      // Tie-breaker 2: lowest risk (based on STRATEGY_PRIORITY index)
      return (
        STRATEGY_PRIORITY.indexOf(a.strategy) -
        STRATEGY_PRIORITY.indexOf(b.strategy)
      );
    });

  return ranked[0].strategy;
}

/**
 * Run simulation for all 4 strategies and compare results
 *
 * @param client - Client data (strategy field will be overridden for each run)
 * @param startYear - First year of projection
 * @param endYear - Last year of projection
 * @returns MultiStrategyResult with all 4 outcomes, best strategy, and comparison metrics
 *
 * FIXME(aum-overlay): This entrypoint dispatches to `runSimulation` (legacy
 * formula.ts engine) for every strategy and does NOT apply the AUM
 * split-allocation overlay or the AUM-bucket scheduled-withdrawal absorption
 * that `app/api/clients/[id]/projections/route.ts` plumbs through
 * `runAumOverlay`. As of writing, `<MultiStrategyResults>` and the
 * `/api/pdf/[clientId]` PDF route that depend on this are not mounted by any
 * live UI, so no advisor sees the gap today. If/when this surface is
 * re-enabled, mirror the dispatch + AUM overlay from the projections route
 * so AUM clients don't see the strategy-comparison numbers diverge from
 * their main report — the symptom would be: scheduled withdrawals at
 * `aum_allocation_percent` ≥ ~50% silently clip to ≤ availableIRA and the
 * comparison view shows different lifetime wealth than the main projection.
 */
export function runMultiStrategySimulation(
  client: Client,
  startYear: number,
  endYear: number
): MultiStrategyResult {
  const results: Record<StrategyType, SimulationResult> = {} as Record<StrategyType, SimulationResult>;

  // Run simulation for each strategy
  for (const strategy of STRATEGIES) {
    // Create client variant with this strategy
    // IMPORTANT: Use spread to avoid mutating original client
    const clientWithStrategy: Client = {
      ...client,
      strategy
    };

    results[strategy] = runSimulation({
      client: clientWithStrategy,
      startYear,
      endYear
    });
  }

  // Determine best strategy
  const bestStrategy = determineBestStrategy(results);

  // Extract comparison metrics for each strategy
  const comparisonMetrics: Record<StrategyType, StrategyComparisonMetrics> = {} as Record<StrategyType, StrategyComparisonMetrics>;
  for (const strategy of STRATEGIES) {
    comparisonMetrics[strategy] = extractComparisonMetrics(results[strategy]);
  }

  return {
    strategies: results,
    bestStrategy,
    comparisonMetrics
  };
}
