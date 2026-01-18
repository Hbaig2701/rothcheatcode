# Requirements

**Project:** Rothc - Roth IRA Conversion Optimizer
**Status:** Locked (2026-01-18)

---

## Business Context

| Aspect | Decision |
|--------|----------|
| Primary Users | Financial Advisors (selling Fixed Indexed Annuities) |
| Distribution Model | Direct SaaS subscription |
| MVP Timeline | No hard deadline |
| Compliance Requirements | None for MVP |
| Integrations | None for MVP |

---

## Core Features (Must Have)

- [ ] User authentication (email/password, magic links, social SSO)
- [ ] Multi-client management (create, edit, delete, search)
- [ ] Comprehensive client data entry form (28 fields)
- [ ] Dual-scenario projection engine (Baseline vs Blueprint)
- [ ] Year-over-year detailed tables
- [ ] Summary comparison dashboard
- [ ] PDF export (professional report)
- [ ] Excel export (for CPA review)

---

## Competitive Improvements (All in Scope)

1. **Accurate state tax calculation** - Progressive state tax brackets, not flat override
2. **Inflation-adjusted projections** - Future value calculations with configurable inflation rate
3. **Multi-strategy comparison** - Conservative/Moderate/Aggressive/IRMAA-Safe side-by-side
4. **Tax payment source comparison** - Show impact of paying conversion tax from IRA vs external funds
5. **IRMAA cliff visualization** - Chart showing Medicare premium impact at income thresholds
6. **Widow's penalty deep dive** - Single-filer tax bracket impact after spouse death
7. **NIIT calculation** - Net Investment Income Tax (3.8%) when applicable
8. **ACA subsidy impact** - For pre-Medicare clients, show healthcare subsidy cliffs
9. **Breakeven age analysis** - When does conversion strategy "pay off"?
10. **5-year Roth seasoning tracker** - Track which conversions are penalty-free
11. **Sensitivity analysis** - What if growth is higher/lower? Tax rates change?
12. **Compliance audit trail** - Log all calculations with timestamps and inputs

---

## Explicitly Out of Scope (MVP)

- Client-facing portal (clients receive PDF reports only)
- CRM integrations (Salesforce, Wealthbox, Redtail)
- Annuity carrier API integrations
- Document signing (DocuSign)
- Mobile-optimized experience
- White-label / multi-tenant organizations

---

## User Experience Requirements

| Aspect | Decision |
|--------|----------|
| Primary Device | Desktop (office use) |
| Data Entry Style | Comprehensive/detailed (all fields visible) |
| Calculation Speed | Real-time (< 2 seconds) |
| "Wow Moment" | Wealth divergence chart |
| Client Access | Advisor-only (clients see PDF/printouts) |

---

## Technical Constraints

| Aspect | Decision |
|--------|----------|
| Hosting | Vercel |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email/password, magic links, Google SSO) |
| Framework | Next.js 15 + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Charts | Recharts |
| Budget | No constraints |

---

## Client Data Entry Form Fields (28 Total)

### Personal Information (6 fields)
| Field | Type | Required | Default |
|-------|------|----------|---------|
| Client Name | text | Yes | - |
| Date of Birth | date | Yes | - |
| State of Residence | select | Yes | - |
| Filing Status | select | Yes | Married Filing Jointly |
| Spouse DOB | date | If married | - |
| Life Expectancy | number | No | Actuarial table |

### Account Balances (4 fields)
| Field | Type | Required | Default |
|-------|------|----------|---------|
| Traditional IRA | currency | Yes | - |
| Roth IRA | currency | No | $0 |
| Taxable Accounts | currency | No | $0 |
| Other Retirement | currency | No | $0 |

### Tax Configuration (4 fields)
| Field | Type | Required | Default |
|-------|------|----------|---------|
| Federal Bracket | select | Yes | Auto-detect |
| State Tax Rate | select/auto | No | Based on state |
| Include NIIT | checkbox | No | true |
| Include ACA | checkbox | No | false |

### Income Sources (5 fields)
| Field | Type | Required | Default |
|-------|------|----------|---------|
| SS Self | currency | No | $0 |
| SS Spouse | currency | No | $0 |
| Pension | currency | No | $0 |
| Other Income | currency | No | $0 |
| SS Start Age | number | No | 67 |

### Conversion Settings (4 fields)
| Field | Type | Required | Default |
|-------|------|----------|---------|
| Strategy | radio | Yes | Moderate |
| Start Age | number | Yes | Current age |
| End Age | number | Yes | 75 |
| Tax Payment Source | radio | Yes | Taxable |

### Advanced Options (5 fields)
| Field | Type | Required | Default |
|-------|------|----------|---------|
| Growth Rate | percent | No | 6% |
| Inflation Rate | percent | No | 2.5% |
| Heir Bracket | select | No | 32% |
| Projection Years | number | No | 40 |
| Widow Analysis | checkbox | No | false |
| Sensitivity | checkbox | No | false |

**Total: 28 fields** (10 required, 18 optional with smart defaults)

---

## Performance Requirements

- Page load: < 1 second
- Calculation: < 2 seconds
- PDF generation: < 5 seconds
- Excel generation: < 3 seconds

---

## Reference Documents

- `gameplan/01_requirements_lock.md` - Original requirements lock
- `gameplan/02_ux_research.md` - User journeys and form specification
- `gameplan/03_ui_design.md` - Design tokens and components
- `gameplan/04_technical_architecture.md` - Database schema and API design
