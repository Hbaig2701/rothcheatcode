# Roadmap

**Project:** Rothc - Roth IRA Conversion Optimizer
**Milestone:** MVP (v1.0)
**Created:** 2026-01-18

---

## Milestone Overview

Build a SaaS application for financial advisors to model Roth IRA conversion strategies. Clone and improve upon rothblueprint.com with accurate tax calculations, multi-strategy comparison, and professional export capabilities.

---

## Phases

### Phase 00: Project Scaffolding
**Status:** Complete

Empty Next.js app deployed to Vercel with tooling configured.

**Deliverable:** Live URL showing "Rothc - Coming Soon"

---

### Phase 01: Authentication
**Status:** Planned (3 plans ready)

Users can sign up, log in, and access protected dashboard.

**Goal:** Working auth flow with Supabase Auth (email, magic links, Google SSO), protected routes, and empty dashboard visible after login.

**Key Tasks:**
- Supabase Auth provider setup
- Login/signup pages
- Auth middleware for protected routes
- Dashboard layout (sidebar + main area)
- Logout functionality
- Profile creation on signup

---

### Phase 02: Client Management
**Status:** Planned (5 plans ready)

CRUD operations for clients with list/detail views.

**Goal:** Advisors can create, view, edit, and delete clients with search/filter functionality.

**Key Tasks:**
- API routes for client CRUD
- Clients list page with data table
- Search/filter functionality
- Client detail page
- React Query hooks for operations

---

### Phase 03: Client Data Entry Form
**Status:** Complete

Complete data entry form with all 28 fields organized in sections.

**Goal:** Full client form with validation, smart defaults, and database persistence.

**Completed:** 2026-01-18

Plans:
- [x] 03-01-PLAN.md — Foundation: Install library, create data modules, input components
- [x] 03-02-PLAN.md — Expand Zod schema and Client types to 28 fields
- [x] 03-03-PLAN.md — Create Personal, Accounts, Tax form sections
- [x] 03-04-PLAN.md — Create Income, Conversion, Advanced form sections
- [x] 03-05-PLAN.md — Wire ClientForm with all sections and smart defaults
- [x] 03-06-PLAN.md — Database migration and API route updates
- [x] 03-07-PLAN.md — End-to-end verification (checkpoint)

---

### Phase 04: Calculation Engine Core
**Status:** Complete

Basic Baseline vs Blueprint projection engine.

**Goal:** API returns year-by-year projection results for both scenarios.

**Completed:** 2026-01-18

Plans:
- [x] 04-01-PLAN.md — Reference data (RMD factors, IRMAA, federal brackets) and calculation types
- [x] 04-02-PLAN.md — Core modules (RMD, federal tax, state tax, NIIT)
- [x] 04-03-PLAN.md — Income modules (Social Security taxation, IRMAA, ACA, inflation)
- [x] 04-04-PLAN.md — Simulation engine with Baseline and Blueprint scenarios
- [x] 04-05-PLAN.md — Projections API endpoint and database storage

---

### Phase 05: Results Summary Display
**Status:** Planned (3 plans ready)

Show calculation results with summary cards and wealth chart.

**Goal:** Visual results page with summary cards and Recharts line chart showing the "wow moment" wealth divergence.

**Plans:** 3 plans in 3 waves

Plans:
- [ ] 05-01-PLAN.md — Install recharts/react-countup, create transform utilities and useProjection hook
- [ ] 05-02-PLAN.md — Create StatCard, WealthChart, ChartTooltip, SummarySection components
- [ ] 05-03-PLAN.md — Wire ResultsSummary container, results page route, and navigation

---

### Phase 06: Multi-Strategy Comparison
**Status:** Complete

Calculate and display all 4 strategies side-by-side.

**Goal:** Compare Conservative, Moderate, Aggressive, and IRMAA-Safe strategies with best highlighted.

**Completed:** 2026-01-18

Plans:
- [x] 06-01-PLAN.md — Multi-strategy types, strategy definitions, and simulation wrapper
- [x] 06-02-PLAN.md — BestBadge and StrategyComparisonTable components
- [x] 06-03-PLAN.md — MultiStrategyResults container, API endpoint, and results page integration

---

### Phase 07: Deep Dive Views
**Status:** Planned (5 plans ready)

Year-by-year tables and IRMAA visualization.

**Goal:** Complete tabbed detail views with year-by-year data and IRMAA chart.

**Plans:** 5 plans in 3 waves

Plans:
- [ ] 07-01-PLAN.md — Install shadcn/ui Tabs, create YearByYearTable with sticky header
- [ ] 07-02-PLAN.md — Create IRMAAChart with threshold lines and NIITDisplay card
- [ ] 07-03-PLAN.md — Create RothSeasoningTracker and ScheduleSummary components
- [ ] 07-04-PLAN.md — Create DeepDiveTabs container with URL-synced tabs
- [ ] 07-05-PLAN.md — Wire results page route and verify end-to-end (checkpoint)

---

### Phase 08: Advanced Features
**Status:** Not Started

Breakeven analysis, widow's penalty, sensitivity analysis.

**Goal:** All 12 competitive improvements functional.

**Key Tasks:**
- Breakeven age calculation and visualization
- Widow's penalty analysis (single-filer impact)
- ACA subsidy calculations (pre-65)
- Sensitivity analysis module
- Audit log implementation

---

### Phase 09: PDF Export
**Status:** Not Started

Generate professional PDF report.

**Goal:** Downloadable PDF with summary, charts, and year-by-year tables.

**Key Tasks:**
- @react-pdf/renderer setup
- PDF template layout
- Header, summary, chart sections
- Strategy comparison and year-by-year tables
- Disclaimer footer
- Download endpoint

---

### Phase 10: Excel Export + Polish
**Status:** Not Started

Excel export and final QA for launch.

**Goal:** Production-ready MVP with Excel export and polished UX.

**Key Tasks:**
- SheetJS (xlsx) library setup
- Multi-sheet workbook (Summary, Baseline, Blueprint, Inputs)
- Full QA pass
- Edge case handling
- Performance optimization
- Mobile warning implementation

---

## Phase Dependencies

```
Phase 00 (Scaffolding)
    |
    v
Phase 01 (Auth)
    |
    v
Phase 02 (Client CRUD)
    |
    v
Phase 03 (Client Form)
    |
    v
Phase 04 (Calculation Core) ----------------+
    |                                        |
    v                                        |
Phase 05 (Results Summary)                   |
    |                                        |
    v                                        |
Phase 06 (Multi-Strategy) <------------------+
    |
    v
Phase 07 (Deep Dive)
    |
    v
Phase 08 (Advanced Features)
    |
    +---------------+---------------+
    v               v               |
Phase 09 (PDF)  Phase 10 (Excel)    |
    |               |               |
    +---------------+---------------+
                    |
                    v
               LAUNCH MVP
```

---

## Success Criteria

- [ ] Advisors can create clients and enter all required data
- [ ] Calculation engine produces accurate projections (< 2 sec)
- [ ] 4 strategies compared with clear winner identified
- [ ] Professional PDF report exportable
- [ ] Excel export for CPA review
- [ ] All 12 competitive improvements implemented
