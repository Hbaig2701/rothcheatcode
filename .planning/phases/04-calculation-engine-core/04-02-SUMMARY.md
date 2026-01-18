---
phase: 04-calculation-engine-core
plan: 02
subsystem: calculations
tags: [rmd, federal-tax, state-tax, niit]

# Dependency graph
requires:
  - plan: 04-01
    provides: Types, reference data, utilities
provides:
  - RMD calculation module
  - Federal tax progressive calculation
  - State tax calculation (flat and progressive)
  - NIIT calculation (3.8% on net investment income)
affects: [04-03, 04-04]

# Tech tracking
key-files:
  created:
    - lib/calculations/modules/rmd.ts
    - lib/calculations/modules/federal-tax.ts
    - lib/calculations/modules/state-tax.ts
    - lib/calculations/modules/niit.ts
    - lib/data/state-brackets.ts

key-decisions:
  - "RMD uses prior year-end balance divided by distribution period"
  - "Federal tax iterates through brackets accumulating tax"
  - "State tax supports both flat rate and progressive brackets"
  - "NIIT taxes lesser of NII or excess over threshold"

patterns-established:
  - "Each module is a pure function with typed input/output"
  - "All results include both amount and diagnostic info (effective rate, breakdown)"

# Metrics
completed: 2026-01-18
---

# Phase 04 Plan 02: Core Tax Modules Summary

**Implemented RMD, federal tax, state tax, and NIIT calculation modules**

## Accomplishments
- Built RMD calculation with SECURE 2.0 age rules (73 for 1951-1959, 75 for 1960+)
- Built progressive federal tax calculation with bracket breakdown
- Built state tax supporting both flat rate states and progressive bracket states
- Built NIIT calculation (3.8% on net investment income above thresholds)
- Created state brackets data file for progressive state tax calculation

## Files Created
- `lib/calculations/modules/rmd.ts` - RMD with age-based start and Uniform Lifetime Table
- `lib/calculations/modules/federal-tax.ts` - Progressive tax with bracket-by-bracket calculation
- `lib/calculations/modules/state-tax.ts` - Flat/progressive state tax with fallback to top rate
- `lib/calculations/modules/niit.ts` - 3.8% NIIT on lesser of NII or excess over threshold
- `lib/data/state-brackets.ts` - Progressive brackets for major states (CA, NY, NJ, etc.)

## Key Implementation Details
- `calculateRMD`: Checks birth year for start age, caps at age 120
- `calculateFederalTax`: Returns total, effective rate, marginal bracket, and breakdown
- `calculateStateTax`: Uses full brackets where available, falls back to top rate
- `calculateNIIT`: $200K single / $250K joint thresholds

---
*Phase: 04-calculation-engine-core*
*Completed: 2026-01-18*
