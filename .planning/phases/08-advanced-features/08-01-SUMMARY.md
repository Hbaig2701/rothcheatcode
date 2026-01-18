---
phase: 08-advanced-features
plan: 01
subsystem: calculations
tags: [breakeven, aca, analysis, subsidies, applicable-percentage]

# Dependency graph
requires:
  - phase: 04-calculation-engine
    provides: YearlyResult type, simulation engine
provides:
  - BreakEvenAnalysis types for multi-metric breakeven visualization
  - SensitivityScenario/SensitivityResult for future sensitivity analysis
  - WidowTaxImpact/WidowAnalysisResult for widow penalty analysis
  - ACA applicable percentage tables for 2025 and 2026+
  - calculateACASubsidy for precise dollar subsidy calculation
  - analyzeBreakEven function for crossover detection
affects: [08-02, 08-03, visualization, results-display]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Analysis types separate from calculation types
    - Linear interpolation for tax bracket lookups
    - Year-aware ACA cliff handling (2025 vs 2026+)

key-files:
  created:
    - lib/calculations/analysis/types.ts
    - lib/calculations/analysis/breakeven.ts
    - lib/data/aca-percentages.ts
  modified:
    - lib/calculations/modules/aca.ts
    - lib/calculations/index.ts

key-decisions:
  - "BreakEvenAnalysis separates simple vs sustained breakeven for nuanced reporting"
  - "ACA 2025 has no cliff (capped at 8.5%), 2026+ has hard cliff at 400% FPL"
  - "Applicable percentages use linear interpolation within brackets"

patterns-established:
  - "Analysis module in lib/calculations/analysis/ for post-simulation analytics"
  - "Year-conditional data tables for policy changes (2025 vs 2026+)"
  - "Benchmark premium estimates by age for subsidy calculation"

# Metrics
duration: 3min
completed: 2026-01-18
---

# Phase 08 Plan 01: Analysis Types and ACA Enhancement Summary

**Multi-metric breakeven analysis types and enhanced ACA subsidy calculation using actual applicable percentage tables**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-18T15:59:22Z
- **Completed:** 2026-01-18T16:02:07Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Created comprehensive analysis type system for breakeven, sensitivity, and widow penalty features
- Implemented breakeven analysis with simple, sustained, and crossover point detection
- Added ACA applicable percentage tables for 2025 (no cliff) and 2026+ (400% cliff)
- Enhanced ACA module with precise dollar subsidy calculation using linear interpolation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create analysis types and breakeven module** - `a65ab47` (feat)
2. **Task 2: Create ACA applicable percentage data and enhance ACA module** - `a0ca71a` (feat)

## Files Created/Modified

- `lib/calculations/analysis/types.ts` - Analysis types for breakeven, sensitivity, widow penalty
- `lib/calculations/analysis/breakeven.ts` - Multi-metric breakeven analysis with crossover detection
- `lib/data/aca-percentages.ts` - Applicable percentage tables and benchmark premiums
- `lib/calculations/modules/aca.ts` - Enhanced with calculateACASubsidy and conversion impact
- `lib/calculations/index.ts` - Exports for new analysis and ACA functions

## Decisions Made

1. **Simple vs Sustained Breakeven** - BreakEvenAnalysis returns both the first crossover age and the age when blueprint permanently surpasses baseline, providing more nuanced reporting
2. **ACA Year-Conditional Tables** - Separate applicable percentage tables for 2025 (enhanced credits, no cliff) and 2026+ (standard credits, cliff at 400% FPL)
3. **Linear Interpolation** - Applicable percentages interpolate linearly within brackets for accurate intermediate values
4. **Benchmark Premium Estimates** - Added age-based SLCSP estimates (40, 50, 60, 64, couple_60) for subsidy dollar calculations

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Analysis types ready for sensitivity analysis module (08-02)
- BreakEven analysis ready for visualization components
- ACA subsidy calculation ready for conversion impact display
- Widow penalty types ready for survivor analysis module

---
*Phase: 08-advanced-features*
*Completed: 2026-01-18*
