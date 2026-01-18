---
phase: 07-deep-dive-views
plan: 02
subsystem: ui
tags: [recharts, irmaa, niit, visualization, medicare, tax]

# Dependency graph
requires:
  - phase: 04-calculation-engine
    provides: YearlyResult type with tax breakdown fields
  - phase: 05-results-summary-display
    provides: transforms.ts formatCurrency/formatAxisValue utilities
provides:
  - IRMAAChart component with threshold visualization
  - NIITDisplay card showing tax calculation breakdown
  - Barrel exports for deep-dive components
affects: [08-advanced-features, results-page-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - ReferenceLine for threshold visualization
    - Color-coded tier legend
    - Scrollable list for year details

key-files:
  created:
    - components/results/deep-dive/irmaa-chart.tsx
    - components/results/deep-dive/niit-display.tsx
  modified:
    - components/results/deep-dive/index.ts

key-decisions:
  - "totalIncome used as MAGI proxy in IRMAAChart"
  - "5-tier threshold colors: green to dark red severity scale"
  - "NIIT thresholds hardcoded as constant (not from data file)"

patterns-established:
  - "ReferenceLine with strokeDasharray for threshold lines"
  - "Custom tooltip with formatCurrency for cents to dollars"
  - "Badge variant for applies/below threshold states"

# Metrics
duration: 2min
completed: 2026-01-18
---

# Phase 07 Plan 02: IRMAA Chart and NIIT Display Summary

**IRMAA bar chart with 5-tier threshold reference lines and NIITDisplay card showing tax calculation breakdown by filing status**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-18T15:40:09Z
- **Completed:** 2026-01-18T15:42:18Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- IRMAAChart displays MAGI as bars with 5 horizontal dashed reference lines at IRMAA tier thresholds
- Color-coded legend showing threshold amounts by filing status (single vs joint)
- NIITDisplay shows MAGI threshold, total NIIT, and scrollable list of years where NIIT applies
- Badge indicator for whether NIIT applies or stays below threshold

## Task Commits

Each task was committed atomically:

1. **Task 1: Create IRMAAChart component with threshold lines** - `cc0de24` (feat)
2. **Task 2: Create NIITDisplay component** - `f767483` (feat)
3. **Task 3: Update barrel exports** - `be16f1b` (feat)

## Files Created/Modified

- `components/results/deep-dive/irmaa-chart.tsx` - Bar chart with IRMAA threshold reference lines
- `components/results/deep-dive/niit-display.tsx` - NIIT calculation display card
- `components/results/deep-dive/index.ts` - Barrel exports for deep-dive components

## Decisions Made

1. **totalIncome as MAGI proxy** - Used YearlyResult.totalIncome as approximation for Modified AGI since it includes all income sources
2. **Threshold colors** - Used severity scale from green (#22c55e) to dark red (#991b1b) for tiers 1-5
3. **NIIT thresholds hardcoded** - Defined thresholds inline rather than separate data file since they rarely change ($200K single, $250K joint)
4. **Filing status mapping** - Handle all 4 filing statuses with fallback to single for unknown values

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - existing deep-dive directory already contained YearByYearTable from prior 07-01 plan execution.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- IRMAAChart and NIITDisplay ready for integration into deep-dive tab
- Components accept YearlyResult[] and filingStatus props from parent
- Remaining deep-dive components (RothSeasoningTracker, ScheduleSummary) already exist from 07-01

---
*Phase: 07-deep-dive-views*
*Completed: 2026-01-18*
