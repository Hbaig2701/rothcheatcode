# Roth IRA Conversion Optimizer - Project Overview

**Project:** Roth Blueprint Clone (working title: "Toiture")
**Started:** 2026-01-18
**Status:** PLANNING COMPLETE - Ready for Sprint 0

---

## Planning Phases

| Phase | Status | Document |
|-------|--------|----------|
| 1. Discovery & Requirements | ✅ Approved | `01_requirements_lock.md` |
| 2. UX Research | ✅ Approved | `02_ux_research.md` |
| 3. UI Design | ✅ Approved | `03_ui_design.md` |
| 4. Technical Architecture | ✅ Approved | `04_technical_architecture.md` |
| 5. Sprint Planning | ✅ Approved | `05_sprint_plan.md` |

---

## Reference: Competitor Features (rothblueprint.com)

Based on analysis, the competitor offers:
- Client data entry form
- Dual-scenario projection (Baseline vs Blueprint)
- Year-over-year tables
- Summary comparison dashboard
- PDF/Excel export
- Multi-client management

## Proposed Improvements to Evaluate

1. Accurate state tax calculation (vs flat override)
2. Inflation-adjusted projections
3. Multi-strategy comparison (Conservative/Moderate/Aggressive/IRMAA-Safe)
4. Tax payment source comparison
5. IRMAA cliff visualization
6. Widow's penalty deep dive
7. NIIT calculation
8. ACA subsidy impact (pre-Medicare)
9. Breakeven age analysis
10. 5-year Roth seasoning tracker
11. Sensitivity analysis
12. Compliance audit trail

---

## Folder Structure

```
/gameplan
├── 00_overview.md              # This document
├── 01_requirements_lock.md     # Business requirements, scope, constraints
├── 02_ux_research.md           # User journeys, IA, page inventory
├── 03_ui_design.md             # Design tokens, components, layouts
├── 04_technical_architecture.md # Tech stack, schema, API design
├── 05_sprint_plan.md           # Phased implementation plan
└── assets/
    ├── wireframes/             # Layout sketches
    └── data/
        └── reference_tables.json # Tax brackets, IRMAA, RMD factors
```
