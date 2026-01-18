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
**Status:** Planned (5 plans ready)

Basic Baseline vs Blueprint projection engine.

**Goal:** API returns year-by-year projection results for both scenarios.

**Plans:** 5 plans in 4 waves

Plans:
- [ ] 04-01-PLAN.md — Reference data (RMD factors, IRMAA, federal brackets) and calculation types
- [ ] 04-02-PLAN.md — Core modules (RMD, federal tax, state tax, NIIT)
- [ ] 04-03-PLAN.md — Income modules (Social Security taxation, IRMAA, ACA, inflation)
- [ ] 04-04-PLAN.md — Simulation engine with Baseline and Blueprint scenarios
- [ ] 04-05-PLAN.md — Projections API endpoint and database storage

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
**Status:** Not Started

Calculate and display all 4 strategies side-by-side.

**Goal:** Compare Conservative, Moderate, Aggressive, and IRMAA-Safe strategies with best highlighted.

**Key Tasks:**
- Strategy calculation logic (4 strategies)
- Update engine to run all strategies
- Strategy comparison table
- Best strategy highlighting
- Strategy selection for detail view

---

### Phase 07: Deep Dive Views
**Status:** Not Started

Year-by-year tables and IRMAA visualization.

**Goal:** Complete tabbed detail views with year-by-year data and IRMAA chart.

**Key Tasks:**
- Year-by-year data table with sticky header
- Tabbed interface (Summary, Baseline, Blueprint, Schedule)
- IRMAA bar chart with threshold lines
- 5-year Roth seasoning tracker
- NIIT calculation display

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
    │
    ▼
Phase 01 (Auth)
    │
    ▼
Phase 02 (Client CRUD)
    │
    ▼
Phase 03 (Client Form)
    │
    ▼
Phase 04 (Calculation Core) ────────────────┐
    │                                        │
    ▼                                        │
Phase 05 (Results Summary)                   │
    │                                        │
    ▼                                        │
Phase 06 (Multi-Strategy) ◄──────────────────┘
    │
    ▼
Phase 07 (Deep Dive)
    │
    ▼
Phase 08 (Advanced Features)
    │
    ├──────────────┬──────────────┐
    ▼              ▼              │
Phase 09 (PDF)  Phase 10 (Excel) │
    │              │              │
    └──────────────┴──────────────┘
                   │
                   ▼
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
