---
phase: 04-calculation-engine-core
plan: 04
subsystem: calculations
tags: [simulation, baseline, blueprint, strategy]

# Dependency graph
requires:
  - plan: 04-03
    provides: All tax and income modules
provides:
  - Baseline scenario (no conversions)
  - Blueprint scenario (strategic conversions)
  - Simulation engine orchestrating year-by-year projections
  - Strategy-aware conversion amount calculation
affects: [04-05, 05-01]

# Tech tracking
key-files:
  created:
    - lib/calculations/scenarios/baseline.ts
    - lib/calculations/scenarios/blueprint.ts
    - lib/calculations/engine.ts
    - lib/calculations/index.ts

key-decisions:
  - "Baseline: Apply growth, calculate RMD, pay taxes from taxable accounts"
  - "Blueprint: Same as baseline plus strategic Roth conversions"
  - "Strategy configs: conservative=22%, moderate=24%, aggressive=32%, irmaa_safe=24%+strict"
  - "Conversion limited by bracket headroom and IRMAA avoidance"

patterns-established:
  - "Year-by-year simulation with account balance tracking"
  - "Gross-up conversion amount if paying tax from IRA"
  - "Strategy configuration object pattern"

# Metrics
completed: 2026-01-18
---

# Phase 04 Plan 04: Simulation Engine Summary

**Built year-by-year simulation engine with Baseline and Blueprint scenarios**

## Accomplishments
- Built Baseline scenario: no conversions, just RMDs, taxes paid from taxable accounts
- Built Blueprint scenario: strategic Roth conversions based on selected strategy
- Created simulation engine that runs both scenarios and calculates summary metrics
- Implemented strategy-aware conversion calculation with IRMAA avoidance
- Created main index.ts exporting all calculation APIs

## Files Created
- `lib/calculations/scenarios/baseline.ts` - No-conversion scenario
- `lib/calculations/scenarios/blueprint.ts` - Roth conversion scenario
- `lib/calculations/engine.ts` - Main simulation orchestration
- `lib/calculations/index.ts` - Public API exports

## Key Implementation Details

### Baseline Scenario
1. Apply growth to all account balances
2. Calculate and take RMD (if required by age)
3. Add SS, pension, other income (inflation-adjusted)
4. Calculate SS taxation
5. Calculate federal, state, NIIT, IRMAA taxes
6. Deduct taxes from taxable account

### Blueprint Scenario
Same as Baseline plus:
1. Calculate conversion headroom to target bracket
2. Apply IRMAA constraint if strategy requires
3. Execute conversion (Traditional -> Roth)
4. Recalculate taxes with conversion income

### Strategy Configurations
- Conservative: Fill up to 22% bracket, avoid IRMAA
- Moderate: Fill up to 24% bracket, avoid IRMAA
- Aggressive: Fill up to 32% bracket, ignore IRMAA
- IRMAA-Safe: Fill up to 24% bracket, strict IRMAA avoidance

---
*Phase: 04-calculation-engine-core*
*Completed: 2026-01-18*
