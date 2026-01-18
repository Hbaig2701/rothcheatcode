# Sprint Plan

**Generated:** 2026-01-18
**Status:** APPROVED

---

## Overview

11 sprints covering full MVP. Each sprint produces deployable, testable features.

| Sprint | Focus | Key Deliverable |
|--------|-------|-----------------|
| 0 | Scaffolding | Empty app deployed |
| 1 | Auth | Login/signup working |
| 2 | Client CRUD | Create/edit/delete clients |
| 3 | Client Form | Full data entry form |
| 4 | Calculation Core | Basic projection works |
| 5 | Results Summary | Summary cards + chart |
| 6 | Multi-Strategy | 4 strategies compared |
| 7 | Deep Dive | Year-by-year tables, IRMAA |
| 8 | Advanced Features | Breakeven, widow's, sensitivity |
| 9 | PDF Export | Professional PDF report |
| 10 | Excel + Polish | Excel export, QA, launch |

---

## Sprint 0: Project Scaffolding

**Goal:** Empty Next.js app deployed to Vercel with tooling configured.

### Tasks

- [ ] Initialize Next.js 15 with App Router
- [ ] Configure TypeScript strict mode
- [ ] Install and configure Tailwind CSS
- [ ] Initialize shadcn/ui with blue theme
- [ ] Set up Supabase project
- [ ] Configure environment variables
- [ ] Create database tables (schema from arch doc)
- [ ] Set up Supabase Row-Level Security policies
- [ ] Deploy to Vercel
- [ ] Configure domain (if available)

### Deliverable
Live URL showing "Rothc - Coming Soon"

---

## Sprint 1: Authentication

**Goal:** Users can sign up, log in, and access protected dashboard.

### Tasks

- [ ] Set up Supabase Auth providers (email, Google)
- [ ] Create `/login` page with auth form
- [ ] Create `/signup` page
- [ ] Implement magic link auth
- [ ] Create auth middleware for protected routes
- [ ] Build dashboard layout (sidebar + main area)
- [ ] Create empty dashboard page
- [ ] Handle auth state (loading, error, success)
- [ ] Add logout functionality
- [ ] Create `profiles` table trigger on signup

### Deliverable
Working auth flow, empty dashboard visible after login

---

## Sprint 2: Client Management

**Goal:** CRUD operations for clients.

### Tasks

- [ ] Create `GET /api/clients` - list clients
- [ ] Create `POST /api/clients` - create client
- [ ] Create `GET /api/clients/[id]` - get client
- [ ] Create `PUT /api/clients/[id]` - update client
- [ ] Create `DELETE /api/clients/[id]` - delete client
- [ ] Build clients list page with data table
- [ ] Add search/filter functionality
- [ ] Build client detail page (empty, ready for projections)
- [ ] Create empty state for no clients
- [ ] Add React Query hooks for client operations

### Deliverable
Can create, view, edit, delete clients (minimal fields for now)

---

## Sprint 3: Client Data Entry Form

**Goal:** Complete data entry form with all 28 fields.

### Tasks

- [ ] Build `CurrencyInput` component (formatted currency)
- [ ] Build `PercentInput` component
- [ ] Build `FormSection` component (section headers)
- [ ] Create Zod validation schema for client
- [ ] Build Personal Information section (6 fields)
- [ ] Build Account Balances section (4 fields)
- [ ] Build Tax Configuration section (4 fields)
- [ ] Build Income Sources section (5 fields)
- [ ] Build Conversion Settings section (4 fields)
- [ ] Build Advanced Options section (6 fields)
- [ ] Wire form to API (create/update)
- [ ] Add smart defaults based on state selection
- [ ] Add form validation error display

### Deliverable
Full client form working, saves to database

---

## Sprint 4: Calculation Engine - Core

**Goal:** Basic Baseline vs Blueprint projection works.

### Tasks

- [ ] Seed reference data (tax brackets, RMD factors, IRMAA)
- [ ] Build `rmd.ts` - RMD calculation
- [ ] Build `federal-tax.ts` - federal tax brackets
- [ ] Build `state-tax.ts` - state tax (all 50 states)
- [ ] Build `engine.ts` - year-by-year simulation loop
- [ ] Implement Baseline scenario (no conversion)
- [ ] Implement Blueprint scenario (with conversion)
- [ ] Create `POST /api/clients/[id]/projections` endpoint
- [ ] Store projection results in database
- [ ] Add loading state during calculation

### Deliverable
API returns Baseline vs Blueprint year-by-year results

---

## Sprint 5: Results Display - Summary

**Goal:** Show calculation results with summary cards and chart.

### Tasks

- [ ] Build `StatCard` component (big numbers)
- [ ] Build summary section (3 cards: Baseline, Blueprint, Difference)
- [ ] Implement number count-up animation
- [ ] Build `WealthChart` component (Recharts line chart)
- [ ] Style chart (Baseline gray, Blueprint blue)
- [ ] Add chart tooltips
- [ ] Add breakeven age callout
- [ ] Wire results page to projection data
- [ ] Add "Edit Client" and "Export" buttons to header

### Deliverable
Visual results page with summary cards + wealth chart

---

## Sprint 6: Multi-Strategy Comparison

**Goal:** Calculate and display all 4 strategies side-by-side.

### Tasks

- [ ] Implement Conservative strategy logic
- [ ] Implement Moderate strategy logic
- [ ] Implement Aggressive strategy logic
- [ ] Implement IRMAA-Safe strategy logic
- [ ] Update calculation engine to run all strategies
- [ ] Build strategy comparison table
- [ ] Highlight "BEST" strategy
- [ ] Add strategy selection (which to show in detail)
- [ ] Store all strategies in projection results

### Deliverable
4 strategies compared, best highlighted

---

## Sprint 7: Deep Dive Views

**Goal:** Year-by-year tables, IRMAA visualization.

### Tasks

- [ ] Build year-by-year data table component
- [ ] Implement sticky header for long tables
- [ ] Add tabs: Summary | Baseline | Blueprint | Schedule
- [ ] Build Baseline year-by-year table
- [ ] Build Blueprint year-by-year table
- [ ] Build conversion schedule table
- [ ] Build `IrmaaChart` component (bar chart)
- [ ] Show IRMAA threshold lines
- [ ] Add 5-year Roth seasoning tracker table
- [ ] Implement NIIT calculation display

### Deliverable
Complete tabbed detail views with IRMAA viz

---

## Sprint 8: Advanced Features

**Goal:** Breakeven analysis, widow's penalty, sensitivity.

### Tasks

- [ ] Implement breakeven age calculation
- [ ] Build breakeven visualization (age marker on chart)
- [ ] Implement widow's penalty analysis
- [ ] Show single-filer bracket impact
- [ ] Implement ACA subsidy calculations (pre-65)
- [ ] Build sensitivity analysis module
- [ ] Create sensitivity inputs (growth +/- 2%, tax rate changes)
- [ ] Display sensitivity results table
- [ ] Implement audit log writes
- [ ] Add timestamp and inputs snapshot to projections

### Deliverable
All 12 improvements functional

---

## Sprint 9: PDF Export

**Goal:** Generate professional PDF report.

### Tasks

- [ ] Design PDF template layout
- [ ] Set up @react-pdf/renderer
- [ ] Build PDF header (logo, client name, date)
- [ ] Build PDF summary section (3 columns)
- [ ] Render wealth chart to PDF (static image)
- [ ] Build PDF strategy comparison table
- [ ] Build PDF year-by-year tables
- [ ] Add disclaimer footer
- [ ] Create `GET /api/projections/[id]/pdf` endpoint
- [ ] Add download button and progress indicator

### Deliverable
Downloadable PDF report

---

## Sprint 10: Excel Export + Polish

**Goal:** Excel export, QA, final polish.

### Tasks

- [ ] Set up xlsx (SheetJS) library
- [ ] Create Excel workbook structure
- [ ] Build Summary sheet
- [ ] Build Baseline sheet (year-by-year)
- [ ] Build Blueprint sheet (year-by-year)
- [ ] Build Inputs sheet (all client data)
- [ ] Create `GET /api/projections/[id]/xlsx` endpoint
- [ ] Full QA pass - all features
- [ ] Fix edge cases (0 values, missing data)
- [ ] Performance optimization
- [ ] Error handling review
- [ ] Mobile warning (desktop recommended)

### Deliverable
Production-ready MVP

---

## Sprint Dependencies

```
Sprint 0 (Scaffolding)
    │
    ▼
Sprint 1 (Auth)
    │
    ▼
Sprint 2 (Client CRUD)
    │
    ▼
Sprint 3 (Client Form)
    │
    ▼
Sprint 4 (Calculation Core) ────────────────┐
    │                                        │
    ▼                                        │
Sprint 5 (Results Summary)                   │
    │                                        │
    ▼                                        │
Sprint 6 (Multi-Strategy) ◄──────────────────┘
    │
    ▼
Sprint 7 (Deep Dive)
    │
    ▼
Sprint 8 (Advanced Features)
    │
    ├──────────────┬──────────────┐
    ▼              ▼              │
Sprint 9 (PDF)  Sprint 10 (Excel) │
    │              │              │
    └──────────────┴──────────────┘
                   │
                   ▼
              LAUNCH MVP
```

---

## Definition of Done (per sprint)

- [ ] All tasks completed
- [ ] Code reviewed (self-review for solo)
- [ ] No TypeScript errors
- [ ] No console errors
- [ ] Tested manually in browser
- [ ] Deployed to Vercel (preview or production)
- [ ] Documented any API changes

---

*Ready to begin Sprint 0 after plan approval.*
