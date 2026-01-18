---
phase: 08-advanced-features
plan: 02
subsystem: calculation-engine
tags: [widow-penalty, tax-analysis, single-filer, bracket-compression]

# Dependency graph
requires:
  - phase: 04-calculation-engine
    provides: Federal tax calculation, baseline scenario runner
  - phase: 08-01
    provides: Analysis types (WidowTaxImpact, WidowAnalysisResult)
provides:
  - runWidowScenario function for post-spouse-death simulation
  - analyzeWidowPenalty function for full widow tax analysis
  - calculateWidowTaxImpact for year-by-year bracket comparison
affects: [08-advanced-features, 09-pdf-export, ui-deep-dive]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Scenario modifier pattern (baseline -> widow variant)
    - Tax impact comparison (MFJ vs single brackets)

key-files:
  created:
    - lib/calculations/scenarios/widow.ts
    - lib/calculations/analysis/widow-penalty.ts
  modified:
    - lib/calculations/index.ts

key-decisions:
  - "Simplified survivor SS to client's own benefit (future: add 100% spouse option)"
  - "Death year defaults to spouse age 85 or 15 years out"
  - "Recommended conversion increase based on bracket jump > 5%"

patterns-established:
  - "Scenario variation: create new scenario by modifying filing status and income sources"
  - "Tax analysis: compare two filing scenarios year-by-year with bracket tracking"

# Metrics
duration: 2min
completed: 2026-01-18
---

# Phase 08 Plan 02: Widow's Penalty Analysis Summary

**Widow scenario runner and tax impact analysis comparing MFJ vs single-filer brackets post-spouse-death**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-18T15:59:24Z
- **Completed:** 2026-01-18T16:01:45Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created widow scenario runner that simulates post-spouse-death taxes using single filing status
- Built widow penalty analysis module comparing married vs single brackets year-by-year
- Implemented recommended conversion increase calculation to mitigate bracket compression
- Exported all functions from lib/calculations for UI consumption

## Task Commits

Each task was committed atomically:

1. **Task 1: Create widow scenario runner** - `db384bd` (feat)
2. **Task 2: Create widow penalty analysis module** - `e9afe6c` (feat)

## Files Created/Modified
- `lib/calculations/scenarios/widow.ts` - Runs simulation as single filer after spouse death (no spouse SS, single brackets/deduction)
- `lib/calculations/analysis/widow-penalty.ts` - Compares MFJ vs single tax, calculates total additional tax, recommends conversion increase
- `lib/calculations/index.ts` - Added exports for runWidowScenario, analyzeWidowPenalty, calculateWidowTaxImpact

## Decisions Made
- **Simplified survivor Social Security:** Using only client's own benefit for now. Could enhance to support 100% survivor benefit option.
- **Default death year calculation:** Uses spouse age 85 or 15 years out (whichever is greater than 5 years from now).
- **Conversion increase threshold:** Only recommends increase when average bracket jump exceeds 5 percentage points.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - the analysis types were already defined in 08-01, making implementation straightforward.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Widow analysis ready for UI integration (deep dive tab or separate view)
- Can be combined with sensitivity analysis for comprehensive scenario planning
- PDF export can include widow penalty section for married clients

---
*Phase: 08-advanced-features*
*Completed: 2026-01-18*
