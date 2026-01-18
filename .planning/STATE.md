# Project State

**Project:** Rothc - Roth IRA Conversion Optimizer
**Updated:** 2026-01-18
**Current Milestone:** MVP (v1.0)

---

## Current Status

| Aspect | Value |
|--------|-------|
| Active Phase | 03 |
| Phase Status | In Progress (5/8 plans) |
| Last Completed | Phase 03 Plan 06 (Database Migration & API Routes) |
| Blockers | None |

---

## Milestone Progress

| Phase | Name | Status | Plans |
|-------|------|--------|-------|
| 00 | Project Scaffolding | Complete | - |
| 01 | Authentication | In Progress | 2/3 complete |
| 02 | Client Management | Complete ✓ | 5/5 verified |
| 03 | Client Data Entry Form | In Progress | 5/8 complete |
| 04 | Calculation Engine Core | Not Started | - |
| 05 | Results Summary Display | Not Started | - |
| 06 | Multi-Strategy Comparison | Not Started | - |
| 07 | Deep Dive Views | Not Started | - |
| 08 | Advanced Features | Not Started | - |
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

## Session Continuity

| Aspect | Value |
|--------|-------|
| Last session | 2026-01-18 |
| Stopped at | Completed 03-06-PLAN.md |
| Resume file | .planning/phases/03-client-data-entry-form/03-07-PLAN.md |

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
