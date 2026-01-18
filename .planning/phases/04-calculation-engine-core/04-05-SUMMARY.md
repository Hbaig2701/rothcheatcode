---
phase: 04-calculation-engine-core
plan: 05
subsystem: api
tags: [projections, api, database, caching]

# Dependency graph
requires:
  - plan: 04-04
    provides: Simulation engine
provides:
  - Projections database table
  - Projection types
  - GET/POST /api/clients/[id]/projections endpoint
  - Smart caching via input hash
affects: [05-01, 05-02]

# Tech tracking
key-files:
  created:
    - supabase/migrations/004_projections.sql
    - lib/types/projection.ts
    - app/api/clients/[id]/projections/route.ts

key-decisions:
  - "Store year-by-year data as JSONB for flexibility"
  - "Use SHA-256 hash of input fields for cache invalidation"
  - "user_id references profiles(id) to match clients table pattern"
  - "GET returns cached projection if input unchanged"
  - "POST forces recalculation even if cached"

patterns-established:
  - "Input hash for smart cache invalidation"
  - "Projection includes both summary metrics and full year data"
  - "RLS policies restrict access to projection owner"

# Metrics
completed: 2026-01-18
---

# Phase 04 Plan 05: Projections API Summary

**Created database table, types, and API endpoint for projection storage and retrieval**

## Accomplishments
- Created projections database table with proper schema
- Applied migration via Supabase MCP
- Created Projection and ProjectionInsert types
- Built GET endpoint that returns cached or new projection
- Built POST endpoint that forces fresh calculation
- Implemented smart caching using SHA-256 hash of input fields

## Files Created
- `supabase/migrations/004_projections.sql` - Table schema with RLS policies
- `lib/types/projection.ts` - Projection types for API
- `app/api/clients/[id]/projections/route.ts` - GET/POST handlers

## Database Schema
```sql
projections (
  id, client_id, user_id, created_at,
  input_hash, break_even_age, total_tax_savings, heir_benefit,
  baseline_final_*, blueprint_final_*,
  baseline_years (JSONB), blueprint_years (JSONB),
  strategy, projection_years
)
```

## API Behavior
- **GET**: Checks if projection exists with matching input_hash
  - If yes: returns cached projection
  - If no: runs simulation, stores result, returns new projection
- **POST**: Always runs fresh simulation (force recalculate)

## Migration Note
The projections table was recreated during migration to update schema. The user_id column references profiles(id) to match the clients table foreign key pattern (not auth.users directly).

---
*Phase: 04-calculation-engine-core*
*Completed: 2026-01-18*
