---
phase: 04-calculation-engine-core
plan: 03
subsystem: calculations
tags: [social-security, irmaa, aca, inflation]

# Dependency graph
requires:
  - plan: 04-02
    provides: Core tax modules
provides:
  - Social Security taxation calculation
  - IRMAA surcharge calculation
  - ACA subsidy cliff analysis
  - Inflation adjustment utilities
affects: [04-04]

# Tech tracking
key-files:
  created:
    - lib/calculations/modules/social-security.ts
    - lib/calculations/modules/irmaa.ts
    - lib/calculations/modules/aca.ts
    - lib/calculations/modules/inflation.ts

key-decisions:
  - "SS taxation uses provisional income formula (AGI + 50% SS + tax-exempt interest)"
  - "SS thresholds frozen since 1984/1993 - not inflation adjusted"
  - "IRMAA uses 2-year lookback for MAGI"
  - "ACA cliff at 400% FPL (subsidy loss in 2026)"

patterns-established:
  - "SS taxation returns taxable amount and percentage (0/50/85)"
  - "IRMAA headroom helper for strategy optimization"
  - "Inflation adjustment using compound formula"

# Metrics
completed: 2026-01-18
---

# Phase 04 Plan 03: Income Modules Summary

**Implemented Social Security taxation, IRMAA, ACA, and inflation modules**

## Accomplishments
- Built Social Security taxation with 0/50/85% tiers based on provisional income
- Built IRMAA calculation with MAGI-based tier lookup
- Added IRMAA headroom calculator for conversion strategy optimization
- Built ACA cliff analysis (400% FPL threshold)
- Built inflation adjustment utilities for multi-year projections

## Files Created
- `lib/calculations/modules/social-security.ts` - SS taxation with provisional income formula
- `lib/calculations/modules/irmaa.ts` - IRMAA tier lookup and headroom calculation
- `lib/calculations/modules/aca.ts` - ACA subsidy cliff detection
- `lib/calculations/modules/inflation.ts` - Compound inflation adjustment

## Key Implementation Details
- `calculateSSTaxableAmount`: Handles complex 50%/85% taxation formula
- `calculateIRMAA`: Returns tier, monthly premiums, and annual surcharge
- `calculateIRMAAHeadroom`: How much income before hitting next IRMAA tier
- `checkACACliff`: Detects if income exceeds 400% FPL subsidy cutoff
- `adjustForInflation`: Applies compound inflation over multiple years

---
*Phase: 04-calculation-engine-core*
*Completed: 2026-01-18*
