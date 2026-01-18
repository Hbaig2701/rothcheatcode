---
phase: 06-multi-strategy-comparison
plan: 01
subsystem: calculations
tags: [multi-strategy, simulation, comparison, roth-conversion]

# Dependency graph
requires:
  - phase: 04-calculation-engine-core
    provides: runSimulation() engine with Baseline/Blueprint scenarios
provides:
  - runMultiStrategySimulation() function for running all 4 strategies
  - StrategyType, StrategyComparisonMetrics, MultiStrategyResult types
  - STRATEGY_DEFINITIONS with centralized strategy configs
  - determineBestStrategy with 3-level tie-breaking
affects: [06-02 comparison-table, 07-deep-dive-views, api-projections]

# Tech tracking
tech-stack:
  added: []
  patterns: [multi-strategy-simulation-wrapper, comparison-metrics-extraction]

key-files:
  created:
    - lib/calculations/strategy-definitions.ts
    - lib/calculations/multi-strategy.ts
  modified:
    - lib/calculations/types.ts
    - lib/calculations/index.ts

key-decisions:
  - "StrategyType matches client.strategy values for type consistency"
  - "All currency values in cents (project convention)"
  - "3-level tie-breaking: wealth > IRMAA > risk (via STRATEGY_PRIORITY)"
  - "Client object spread to avoid mutation during multi-strategy run"

patterns-established:
  - "Multi-strategy wrapper: Loop through STRATEGIES array, spread client with strategy override"
  - "Comparison metrics extraction: Pull key values from SimulationResult for table display"
  - "Strategy priority: Lower risk strategies preferred on tie (irmaa_safe > conservative > moderate > aggressive)"

# Metrics
duration: 2min
completed: 2026-01-18
---

# Phase 06 Plan 01: Multi-Strategy Calculation Wrapper Summary

**Multi-strategy simulation wrapper running all 4 Roth conversion strategies with comparison metrics extraction and best strategy determination**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-18T15:23:59Z
- **Completed:** 2026-01-18T15:25:43Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Added StrategyType, StrategyComparisonMetrics, and MultiStrategyResult types for multi-strategy comparison
- Created centralized STRATEGY_DEFINITIONS with all 4 strategies (conservative, moderate, aggressive, irmaa_safe)
- Implemented runMultiStrategySimulation() that runs all 4 strategies in a single call
- Added determineBestStrategy() with 3-level tie-breaking (wealth > IRMAA > risk)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add multi-strategy types to calculations** - `5243dd3` (feat)
2. **Task 2: Create strategy definitions constant** - `6c7ed2e` (feat)
3. **Task 3: Create multi-strategy simulation wrapper** - `78641ff` (feat)

## Files Created/Modified
- `lib/calculations/types.ts` - Added StrategyType, StrategyComparisonMetrics, MultiStrategyResult types
- `lib/calculations/strategy-definitions.ts` - Created STRATEGY_DEFINITIONS, STRATEGIES, STRATEGY_PRIORITY constants
- `lib/calculations/multi-strategy.ts` - Created runMultiStrategySimulation() wrapper function
- `lib/calculations/index.ts` - Exported all new multi-strategy functions and types

## Decisions Made
- StrategyType uses exact same values as client.strategy for type consistency
- All currency values stored in cents (consistent with project convention from STATE.md)
- 3-level tie-breaking ensures deterministic best strategy selection (wealth > IRMAA > risk)
- Client object is spread (not mutated) when running each strategy variant

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- runMultiStrategySimulation() ready to power comparison table in 06-02
- All 4 strategy results available with extracted comparison metrics
- Best strategy determination logic complete with tie-breaking

---
*Phase: 06-multi-strategy-comparison*
*Completed: 2026-01-18*
