---
phase: 04-calculation-engine-core
plan: 01
subsystem: calculations
tags: [types, reference-data, rmd, irmaa, federal-brackets]

# Dependency graph
requires:
  - phase: 03-client-data-entry-form
    provides: Client type with all 28 fields
provides:
  - Calculation types (SimulationInput, YearlyResult, etc.)
  - RMD factors (Uniform Lifetime Table)
  - IRMAA brackets 2026
  - Federal brackets 2026 with inflation adjustment
  - Standard deductions with senior bonuses
  - Federal poverty levels for ACA
  - Money and age utility functions
affects: [04-02, 04-03, 04-04, 04-05]

# Tech tracking
tech-stack:
  added: []
  patterns: [cents-based-storage, pure-functions]

key-files:
  created:
    - lib/calculations/types.ts
    - lib/calculations/utils/money.ts
    - lib/calculations/utils/age.ts
    - lib/data/rmd-factors.ts
    - lib/data/irmaa-brackets.ts
    - lib/data/federal-brackets-2026.ts
    - lib/data/standard-deductions.ts
    - lib/data/federal-poverty.ts

key-decisions:
  - "All monetary values stored in cents as integers"
  - "RMD start age: 73 for 1951-1959, 75 for 1960+"
  - "IRMAA uses cliffs not gradual increases"
  - "Federal brackets auto-inflate 2.7%/year for future projections"

patterns-established:
  - "Pure function calculation modules"
  - "Reference data with year indexing"
  - "TaxBracket: { lower, upper, rate } with Infinity for top bracket"

# Metrics
completed: 2026-01-18
---

# Phase 04 Plan 01: Reference Data and Types Summary

**Created all calculation types, tax reference data, and utility functions**

## Accomplishments
- Defined all calculation input/output types (FederalTaxInput, RMDInput, SimulationResult, etc.)
- Created RMD factors table with ages 72-120 matching IRS Uniform Lifetime Table
- Created IRMAA brackets 2026 with 6 tiers and cliff detection
- Created federal tax brackets 2026 for all 4 filing statuses with inflation adjustment
- Created standard deductions with senior bonus calculations
- Created federal poverty level data for ACA subsidy cutoff calculations
- Built money utilities (centsToDollars, dollarsToCents, formatCurrency)
- Built age utilities (calculateAge, getRMDStartAge)

## Files Created
- `lib/calculations/types.ts` - 18 interfaces covering all calculation needs
- `lib/calculations/utils/money.ts` - Currency conversion utilities
- `lib/calculations/utils/age.ts` - Age and RMD start age calculations
- `lib/data/rmd-factors.ts` - Uniform Lifetime Table (ages 72-120)
- `lib/data/irmaa-brackets.ts` - IRMAA tiers with cliff detection helper
- `lib/data/federal-brackets-2026.ts` - 7 brackets x 4 filing statuses
- `lib/data/standard-deductions.ts` - Base deductions + senior bonuses
- `lib/data/federal-poverty.ts` - FPL by state/household size

## Deviations from Plan
None - plan executed as written.

---
*Phase: 04-calculation-engine-core*
*Completed: 2026-01-18*
