# Project State

**Project:** Rothc - Roth IRA Conversion Optimizer
**Updated:** 2026-01-18
**Current Milestone:** MVP (v1.0)

---

## Current Status

| Aspect | Value |
|--------|-------|
| Active Phase | 08 |
| Phase Status | In Progress |
| Last Completed | Phase 08 Plan 02 (Widow's Penalty Analysis) |
| Blockers | None |

---

## Milestone Progress

| Phase | Name | Status | Plans |
|-------|------|--------|-------|
| 00 | Project Scaffolding | Complete | - |
| 01 | Authentication | In Progress | 2/3 complete |
| 02 | Client Management | Complete ✓ | 5/5 verified |
| 03 | Client Data Entry Form | Complete ✓ | 7/7 verified |
| 04 | Calculation Engine Core | Complete ✓ | 5/5 verified |
| 05 | Results Summary Display | Complete ✓ | 3/3 verified |
| 06 | Multi-Strategy Comparison | Complete ✓ | 3/3 verified |
| 07 | Deep Dive Views | In Progress | 4/? complete |
| 08 | Advanced Features | In Progress | 2/? complete |
| 09 | PDF Export | Not Started | - |
| 10 | Excel Export + Polish | Not Started | - |

---

## Key Decisions Made

### Technical Stack
- **Framework:** Next.js 15 with App Router
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS + shadcn/ui (blue theme)
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth (email, magic links, Google SSO)
- **Charts:** Recharts
- **Hosting:** Vercel

### Architecture
- Server-side rendering for initial load
- Client-side calculation engine (< 2 sec target)
- Row-Level Security for multi-tenant data isolation
- API routes for CRUD operations

### Auth Implementation (01-01)
- Token hash flow for email confirmation (cross-browser reliable)
- Server actions return error objects (allows form error handling)

### Auth UI Pages (01-02)
- FormAction type cast for base-ui compatibility with server action return types
- SubmitButton uses useFormStatus for automatic loading state

### Client Management Foundation (02-01)
- Zod v4 API syntax (message instead of errorMap)
- QueryProvider: 1 minute stale time, no refetch on window focus

### API Routes (02-02)
- Use getUser() instead of getSession() for secure server-side JWT validation
- PGRST116 error code maps to 404 (handles both not found and RLS blocked)
- Next.js 15 async params pattern: await context.params

### Query Hooks (02-03)
- Query key factory pattern for consistent cache management
- Hierarchical key structure enables granular cache invalidation

### Clients List Page (02-04)
- Column factory function (createColumns) to inject onDelete callback
- buttonVariants() with Link for base-ui compatible button links
- window.location for dropdown menu navigation (MenuItem no asChild)
- Memoized columns prevent TanStack Table infinite re-renders

### Client Form Pages (02-05)
- Base UI render prop pattern for polymorphic buttons (instead of asChild)
- ClientForm dual-mode: edit if client prop provided, create otherwise
- react-hook-form with Zod resolver for form validation

### Foundation Components (03-01)
- react-currency-input-field for formatted currency inputs
- CurrencyInput stores/accepts cents, displays dollars with $ prefix
- PercentInput accepts percentage number, displays with % suffix
- US_STATES has 51 entries with tax type and top rate
- FormSection provides responsive 3-column grid layout

### Validation Schema (03-02)
- Currency stored as cents (integers) for precision
- Conditional validation via Zod superRefine for cross-field rules
- Form/API type divergence: hooks accept union types for backwards compat
- Enum schemas exported separately for UI select component reuse

### Form Sections Part 1 (03-03)
- Controller pattern for custom inputs (CurrencyInput, PercentInput, Checkbox)
- useFormContext for prop-free form field access
- Conditional field rendering via watched values (spouse DOB only for married)
- Auto-fill state tax rate from state selection via useEffect
- Checkbox component created with base-ui/react

### Form Sections Part 2 (03-04)
- Native HTML radio inputs with Tailwind styling (simpler than custom component)
- Native HTML checkboxes with register() for boolean fields
- Heir bracket dropdown excludes "auto" option (explicit bracket required)

### Form Composition & Smart Defaults (03-05)
- ClientFormData explicit type: Separate from z.infer to avoid .default() optional field issues
- Resolver type assertion: Cast zodResolver to match explicit form type
- Smart defaults conditionally set: Only when null/undefined (life expectancy) or initial default (start age)
- FormProvider wrapper pattern: Enables useFormContext in sections instead of prop drilling

### Database Migration & API Routes (03-06)
- BIGINT for currency fields to handle large account balances in cents
- clientFullSchema for API validation (28 fields vs legacy 4 fields)
- ADD COLUMN IF NOT EXISTS for idempotent migrations
- CHECK constraints for database-level enum validation

### UX Decisions
- Desktop-first (office use)
- Comprehensive data entry (all fields visible)
- Advisor-only access (clients receive PDFs)
- 28-field client data entry form

---

### End-to-End Verification (03-07)
- Smart defaults use dirtyFields tracking: only skip auto-update if user explicitly modified field
- Life expectancy and start_age recalculate on DOB change unless user edited them

### Reference Data (04-01)
- All monetary values stored in cents as integers to avoid floating-point errors
- RMD start age: 73 for birth year 1951-1959, 75 for 1960+
- IRMAA uses cliffs (not gradual increases) - $1 over triggers full surcharge
- Federal brackets auto-inflate 2.7%/year for future projections

### Tax Calculation Modules (04-02, 04-03)
- Pure function pattern: typed input -> typed output with no side effects
- SS taxation uses provisional income formula (frozen thresholds since 1984/1993)
- NIIT: 3.8% on lesser of NII or excess over $200K/$250K threshold
- State tax supports both flat rate and progressive brackets

### Simulation Engine (04-04)
- Baseline: no conversions, RMDs only, taxes from taxable accounts
- Blueprint: strategic conversions to target bracket with IRMAA awareness
- Strategy configs: conservative=22%, moderate=24%, aggressive=32%, irmaa_safe=24%+strict
- Gross-up conversion amount if paying tax from IRA

### Projections API (04-05)
- Input hash (SHA-256) enables smart cache invalidation
- user_id references profiles(id) to match clients table FK pattern
- GET returns cached if hash matches, POST forces recalculation
- Year-by-year data stored as JSONB for flexibility

### Visualization Libraries & Data Transform (05-01)
- 5-minute staleTime for projection queries (expensive computation)
- Projection hooks in lib/queries/ following clients.ts pattern
- Transform utilities separate from component code

### Multi-Strategy Calculation Wrapper (06-01)
- StrategyType matches client.strategy values for type consistency
- All currency values in cents (project convention)
- 3-level tie-breaking for best strategy: wealth > IRMAA > risk
- Client object spread to avoid mutation during multi-strategy run

### Strategy Comparison UI (06-02)
- bg-primary/10 for best strategy column highlight
- Green text for positive savings, amber for IRMAA costs
- formatCurrency: cents to dollars with Intl.NumberFormat
- Horizontal scroll with min-w-[700px] for mobile

### Display Components (05-02)
- StatCard accepts value in cents, converts to dollars for display
- Custom ChartTooltipProps interface for Recharts v3 type compatibility
- WealthChart parent div requires explicit 400px height for ResponsiveContainer
- Trend indicator with TrendingUp/Down/Minus icons and green/red/muted colors

### Tabs and Year-by-Year Table (07-01)
- Sticky header: sticky top-0 z-10 on thead with bg-muted/50 on th cells
- TableColumn interface: key, label, format, className, highlight for column config
- Conversion year rows highlighted with bg-blue-50/50 for blueprint scenario
- font-mono for all numeric cells for proper alignment

### IRMAA and NIIT Visualization (07-02)
- IRMAAChart uses totalIncome as MAGI proxy
- ReferenceLine with strokeDasharray="5 5" for threshold visualization
- 5-tier threshold colors: green to dark red severity scale (#22c55e to #991b1b)
- NIIT thresholds hardcoded: $200K single, $250K joint, $125K MFS, $200K HoH

### Results Page Wiring (05-03)
- ResultsSummary container component orchestrates display components
- Server/client split: page fetches client name server-side, projection client-side
- Recalculate button for manual projection refresh
- Conditional heir benefit card shown only when positive

### Roth Seasoning & Schedule Summary (07-03)
- 5-year rule: conversion year + 5 = seasoned year (starts January 1)
- Age 59.5+ simplified to age >= 60 for penalty exemption check
- Status colors: green (seasoned), yellow (pending), muted (future)
- ConversionCohort interface for tracking seasoning status

### Deep Dive Tabs Container (07-04)
- URL state via searchParams for shareable/bookmarkable tab URLs
- scroll: false in router.push prevents page jump on tab change
- Client age calculated as currentYear - birthYear for simplicity
- Grid layout for Schedule tab: 2-column responsive lg:grid-cols-2

### Widow's Penalty Analysis (08-02)
- Widow scenario uses single filing status for all calculations (SS taxation, deductions, brackets, NIIT, IRMAA)
- Survivor Social Security simplified to client's own benefit (future: 100% survivor option)
- Death year defaults to spouse age 85 or 15 years out (min 5 years)
- Recommended conversion increase triggered when avg bracket jump > 5 percentage points

### Breakeven Analysis Types (08-01)
- BreakEvenAnalysis separates simple vs sustained breakeven for nuanced reporting
- CrossoverPoint tracks all wealth crossover events between scenarios
- Analysis module in lib/calculations/analysis/ for post-simulation analytics

### ACA Subsidy Enhancement (08-01)
- ACA 2025 has no cliff (capped at 8.5%), 2026+ has hard cliff at 400% FPL
- Applicable percentages use linear interpolation within brackets
- Year-conditional data tables for policy changes (2025 vs 2026+)
- Benchmark premium estimates by age for precise subsidy calculation

---

## Session Continuity

| Aspect | Value |
|--------|-------|
| Last session | 2026-01-18 |
| Stopped at | Completed 08-02-PLAN.md |
| Resume file | .planning/phases/08-advanced-features/ |

---

## Reference Documents

- `gameplan/01_requirements_lock.md` - Business requirements
- `gameplan/02_ux_research.md` - User journeys and IA
- `gameplan/03_ui_design.md` - Design tokens and components
- `gameplan/04_technical_architecture.md` - Tech stack and schema
- `gameplan/05_sprint_plan.md` - Implementation sprints

---

## Notes

Sprint 0 (Scaffolding) completed during project initialization.
Phases 01-02 have research and plans ready for execution.
Phase 01 Plan 01 complete - auth server actions and callback routes ready.
Phase 01 Plan 02 complete - login/signup pages with SubmitButton loading states.
Phase 02 Plan 01 complete - TanStack Query, types, validation schemas, and Table component ready.
Phase 02 Plan 02 complete - REST API endpoints for client CRUD operations ready.
Phase 02 Plan 03 complete - TanStack Query hooks for all client CRUD operations with cache invalidation.
Phase 02 Plan 04 complete - Clients list page with TanStack Table, sorting, filtering, delete confirmation.
Phase 02 Plan 05 complete - Client form, new/edit/detail pages with react-hook-form validation.
Phase 03 Plan 01 complete - CurrencyInput/PercentInput components, US state tax data, FormSection layout.
Phase 03 Plan 02 complete - 28-field Zod validation schema with conditional validation, Client types expanded.
Phase 03 Plan 03 complete - PersonalInfoSection, AccountBalancesSection, TaxConfigSection with 14 fields.
Phase 03 Plan 04 complete - IncomeSourcesSection, ConversionSection, AdvancedSection with 15 total fields.
Phase 03 Plan 05 complete - ClientForm composition with all 6 sections, useSmartDefaults hook for auto-calculations.
Phase 03 Plan 06 complete - Database migration for 25 new columns, API routes updated for full 28-field schema.
Phase 03 Plan 07 complete - End-to-end verification passed. Fixed smart defaults to update on DOB change.
Phase 04 Plan 01 complete - Types, reference data (RMD, IRMAA, federal brackets, deductions, FPL), utilities ready.
Phase 04 Plan 02 complete - Core tax modules (RMD, federal tax, state tax, NIIT) implemented.
Phase 04 Plan 03 complete - Income modules (SS taxation, IRMAA, ACA, inflation) implemented.
Phase 04 Plan 04 complete - Simulation engine with Baseline and Blueprint scenarios ready.
Phase 04 Plan 05 complete - Projections API endpoint and database migration applied.
Phase 05 Plan 01 complete - Recharts, react-countup libraries, transform utilities, and useProjection query hooks.
Phase 06 Plan 01 complete - Multi-strategy simulation wrapper with runMultiStrategySimulation(), STRATEGY_DEFINITIONS, and comparison metrics.
Phase 06 Plan 02 complete - StrategyComparisonTable and BestBadge components for 4-strategy comparison with highlighting.
Phase 05 Plan 02 complete - StatCard, ChartTooltip, WealthChart, SummarySection display components for results page.
Phase 05 Plan 03 complete - ResultsSummary container, results page route, View Results navigation (checkpoint deferred).
Phase 07 Plan 01 complete - shadcn/ui Tabs component, YearByYearTable with sticky header and 12 columns.
Phase 07 Plan 02 complete - IRMAAChart with 5-tier threshold reference lines, NIITDisplay with filing status thresholds.
Phase 07 Plan 03 complete - RothSeasoningTracker with 5-year rule status, ScheduleSummary with conversion timeline.
Phase 07 Plan 04 complete - DeepDiveTabs container with URL-synced 4-tab interface integrating all Phase 07 components.
Phase 08 Plan 02 complete - Widow scenario runner and penalty analysis comparing MFJ vs single-filer brackets.
Phase 08 Plan 01 complete - Analysis types (breakeven, sensitivity, widow) and ACA applicable percentage tables with precise subsidy calculation.
