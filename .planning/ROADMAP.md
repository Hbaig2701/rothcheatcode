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
**Status:** Complete ✓

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
**Status:** Not Started

Basic Baseline vs Blueprint projection engine.

**Goal:** API returns year-by-year projection results for both scenarios.

**Key Tasks:**
- Seed reference data (tax brackets, RMD factors, IRMAA)
- RMD calculation module
- Federal tax bracket calculation
- State tax calculation (all 50 states)
- Year-by-year simulation engine
- Baseline and Blueprint scenario logic
- Projection storage in database

---

### Phase 05: Results Summary Display
**Status:** Not Started

Show calculation results with summary cards and wealth chart.

**Goal:** Visual results page with summary cards and Recharts line chart.

**Key Tasks:**
- StatCard component with count-up animation
- Summary section (Baseline, Blueprint, Difference)
- WealthChart component (gray baseline, blue blueprint)
- Chart tooltips and breakeven callout
- Wire to projection data

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
