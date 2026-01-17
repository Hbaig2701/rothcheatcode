# Requirements Lock Document

**Generated:** 2026-01-18
**Status:** APPROVED (2026-01-18)

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

## Feature Scope

### Core Features (Must Have)

- [ ] User authentication (email/password, magic links, social SSO)
- [ ] Multi-client management (create, edit, delete, search)
- [ ] Comprehensive client data entry form
- [ ] Dual-scenario projection engine (Baseline vs Blueprint)
- [ ] Year-over-year detailed tables
- [ ] Summary comparison dashboard
- [ ] PDF export (professional report)
- [ ] Excel export (for CPA review)

### Improvements Over Competitor (All in Scope)

- [ ] **Accurate state tax calculation** - Progressive state tax brackets, not flat override
- [ ] **Inflation-adjusted projections** - Future value calculations with configurable inflation rate
- [ ] **Multi-strategy comparison** - Conservative/Moderate/Aggressive/IRMAA-Safe side-by-side
- [ ] **Tax payment source comparison** - Show impact of paying conversion tax from IRA vs external funds
- [ ] **IRMAA cliff visualization** - Chart showing Medicare premium impact at income thresholds
- [ ] **Widow's penalty deep dive** - Single-filer tax bracket impact after spouse death
- [ ] **NIIT calculation** - Net Investment Income Tax (3.8%) when applicable
- [ ] **ACA subsidy impact** - For pre-Medicare clients, show healthcare subsidy cliffs
- [ ] **Breakeven age analysis** - When does conversion strategy "pay off"?
- [ ] **5-year Roth seasoning tracker** - Track which conversions are penalty-free
- [ ] **Sensitivity analysis** - What if growth is higher/lower? Tax rates change?
- [ ] **Compliance audit trail** - Log all calculations with timestamps and inputs

### Explicitly Out of Scope (MVP)

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
| Budget | No constraints |

---

## Open Questions

None at this time. All requirements have been clarified.

---

## Approval

By approving this document, we lock these requirements for implementation. Changes after approval will require a formal scope change discussion.

- [x] **USER APPROVAL:** I have reviewed and approve this requirements lock (2026-01-18)

---

*This document serves as the single source of truth for what we're building.*
