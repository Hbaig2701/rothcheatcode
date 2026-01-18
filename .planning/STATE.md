# Project State

**Project:** Rothc - Roth IRA Conversion Optimizer
**Updated:** 2026-01-18
**Current Milestone:** MVP (v1.0)

---

## Current Status

| Aspect | Value |
|--------|-------|
| Active Phase | 02 |
| Phase Status | In Progress |
| Last Completed | 02-05-PLAN.md (Client Form Pages) |
| Blockers | None |

---

## Milestone Progress

| Phase | Name | Status | Plans |
|-------|------|--------|-------|
| 00 | Project Scaffolding | Complete | - |
| 01 | Authentication | In Progress | 2/3 complete |
| 02 | Client Management | In Progress | 5/5 complete |
| 03 | Client Data Entry Form | Not Started | - |
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

### Client Form Pages (02-05)
- Base UI render prop pattern for polymorphic buttons (instead of asChild)
- ClientForm dual-mode: edit if client prop provided, create otherwise
- react-hook-form with Zod resolver for form validation

### UX Decisions
- Desktop-first (office use)
- Comprehensive data entry (all fields visible)
- Advisor-only access (clients receive PDFs)
- 28-field client data entry form

---

## Session Continuity

| Aspect | Value |
|--------|-------|
| Last session | 2026-01-18T07:05:00Z |
| Stopped at | Completed 02-05-PLAN.md |
| Resume file | .planning/phases/03-client-data-entry-form/03-01-PLAN.md |

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
Phase 02 Plan 05 complete - Client form, new/edit/detail pages with react-hook-form validation.
