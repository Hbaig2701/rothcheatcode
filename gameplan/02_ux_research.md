# UX Research Document

**Generated:** 2026-01-18
**Status:** PENDING APPROVAL

---

## 1. User Persona

### Primary Persona: Financial Advisor

**Profile:**
- Age: 35-60
- Tech comfort: Moderate (uses CRM, email, basic web apps)
- Goal: Close annuity sales by demonstrating Roth conversion value
- Context: Office desktop, often with client on phone or preparing for meeting
- Pain points: Current tools are slow, inaccurate, or hard to explain to clients

**Jobs to Be Done:**
1. Quickly model a client's Roth conversion scenario
2. Show compelling visual proof of long-term benefit
3. Generate professional reports for client meetings
4. Track multiple clients and their projections over time

---

## 2. User Journey Map

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ADVISOR USER JOURNEY                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  AWARENESS        ONBOARDING         CORE LOOP           RETENTION      │
│  ─────────        ──────────         ─────────           ─────────      │
│                                                                         │
│  Marketing    →   Sign Up       →   Create Client   →   Return User    │
│  Landing          Verify Email      Enter Data          Find Client     │
│  Page             Dashboard         Calculate           Update Data     │
│                   (empty)           View Results        Re-calculate    │
│                                     Export PDF          Compare History │
│                                     Repeat...           Export...       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Detailed Journey Steps

#### 1. First-Time Setup
| Step | User Action | System Response |
|------|-------------|-----------------|
| 1.1 | Clicks "Sign Up" | Show auth options (email, Google, magic link) |
| 1.2 | Completes auth | Create account, redirect to dashboard |
| 1.3 | Sees empty dashboard | Show welcome message + "Create First Client" CTA |

#### 2. Create Client
| Step | User Action | System Response |
|------|-------------|-----------------|
| 2.1 | Clicks "New Client" | Navigate to client form |
| 2.2 | Fills personal info section | Validate on blur, show errors inline |
| 2.3 | Fills account balances | Format as currency automatically |
| 2.4 | Fills tax configuration | Show smart defaults based on state |
| 2.5 | Fills income sources | Calculate preliminary tax impact |
| 2.6 | Fills conversion settings | Show strategy descriptions |
| 2.7 | Reviews advanced options | Defaults pre-filled, expand to modify |
| 2.8 | Clicks "Save & Calculate" | Save client, trigger projection |

#### 3. View Results
| Step | User Action | System Response |
|------|-------------|-----------------|
| 3.1 | Waits for calculation | Show skeleton loading (< 2 sec) |
| 3.2 | Sees summary cards | Display with count-up animation |
| 3.3 | Views wealth chart | Chart animates drawing |
| 3.4 | Explores strategy comparison | Interactive table with highlights |
| 3.5 | Drills into year-by-year | Tabbed tables (Baseline/Blueprint) |
| 3.6 | Reviews IRMAA impact | Dedicated visualization section |
| 3.7 | Checks breakeven age | Clear callout with age highlighted |

#### 4. Export & Share
| Step | User Action | System Response |
|------|-------------|-----------------|
| 4.1 | Clicks "Export PDF" | Generate PDF, show progress |
| 4.2 | Downloads PDF | Browser download, success toast |
| 4.3 | Clicks "Export Excel" | Generate XLSX, download |

#### 5. Return Visit
| Step | User Action | System Response |
|------|-------------|-----------------|
| 5.1 | Logs in | Redirect to dashboard |
| 5.2 | Sees recent clients | List sorted by last modified |
| 5.3 | Searches for client | Real-time filter as typing |
| 5.4 | Clicks client name | Navigate to client detail |
| 5.5 | Views past projections | List with dates and key metrics |
| 5.6 | Edits client data | Pre-filled form, make changes |
| 5.7 | Re-runs projection | New projection saved, compare to old |

---

## 3. Information Architecture

### Navigation Structure (Client-Centric)

```
┌─────────────────────────────────────────────────────────────────┐
│  ROTHC                                      [User Menu ▼]       │
├────────────┬────────────────────────────────────────────────────┤
│            │                                                    │
│  Dashboard │   [Main Content Area]                              │
│            │                                                    │
│  Clients   │                                                    │
│    └─ All  │                                                    │
│    └─ New  │                                                    │
│            │                                                    │
│  ───────── │                                                    │
│            │                                                    │
│  Settings  │                                                    │
│            │                                                    │
│            │                                                    │
│            │                                                    │
└────────────┴────────────────────────────────────────────────────┘
```

### URL Structure

| Route | Page | Description |
|-------|------|-------------|
| `/` | Landing | Marketing page (logged out) |
| `/login` | Login | Auth page |
| `/signup` | Sign Up | Registration page |
| `/dashboard` | Dashboard | Home for logged-in users |
| `/clients` | Client List | All clients with search/filter |
| `/clients/new` | New Client | Client data entry form |
| `/clients/[id]` | Client Detail | Client profile + projections list |
| `/clients/[id]/edit` | Edit Client | Modify client data |
| `/clients/[id]/projections/[pid]` | Projection Results | Full results view |
| `/settings` | Settings | User preferences |
| `/settings/profile` | Profile | Account settings |
as 
---

## 4. Data Entry Flow

### Single Scrolling Form with Sections

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back to Clients           New Client                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PERSONAL INFORMATION                                           │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Client Name *              Date of Birth *                     │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │ Homer Simpson       │    │ 05/12/1956          │            │
│  └─────────────────────┘    └─────────────────────┘            │
│                                                                 │
│  State of Residence *       Filing Status *                     │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │ Illinois        ▼   │    │ Married Filing...▼  │            │
│  └─────────────────────┘    └─────────────────────┘            │
│                                                                 │
│  Spouse Date of Birth       Life Expectancy Override            │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │ 03/19/1959          │    │ 92 (default)        │            │
│  └─────────────────────┘    └─────────────────────┘            │
│                                                                 │
│                                                                 │
│  ACCOUNT BALANCES                                               │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Traditional IRA *          Roth IRA                            │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │ $1,500,000          │    │ $0                  │            │
│  └─────────────────────┘    └─────────────────────┘            │
│                                                                 │
│  Taxable Accounts           Other Retirement                    │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │ $500,000            │    │ $0                  │            │
│  └─────────────────────┘    └─────────────────────┘            │
│                                                                 │
│                                                                 │
│  TAX CONFIGURATION                                              │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Current Federal Bracket    State Income Tax Rate               │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │ 24%             ▼   │    │ Auto (IL: 4.95%)    │            │
│  └─────────────────────┘    └─────────────────────┘            │
│                                                                 │
│  ☑ Include NIIT (3.8%)      ☑ Include ACA Subsidy Analysis     │
│                                                                 │
│                                                                 │
│  INCOME SOURCES                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Social Security (Self)     Social Security (Spouse)            │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │ $36,000/year        │    │ $24,000/year        │            │
│  └─────────────────────┘    └─────────────────────┘            │
│                                                                 │
│  Pension Income             Other Income                        │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │ $0                  │    │ $0                  │            │
│  └─────────────────────┘    └─────────────────────┘            │
│                                                                 │
│  Social Security Start Age                                      │
│  ┌─────────────────────┐                                       │
│  │ 67                  │                                       │
│  └─────────────────────┘                                       │
│                                                                 │
│                                                                 │
│  CONVERSION SETTINGS                                            │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Conversion Strategy *                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ○ Conservative - Stay within current bracket            │   │
│  │ ● Moderate - Fill up to next bracket                    │   │
│  │ ○ Aggressive - Fill up to 32% bracket                   │   │
│  │ ○ IRMAA-Safe - Stay below IRMAA thresholds              │   │
│  │ ○ Custom - Specify exact amounts                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Conversion Start Age       Conversion End Age                  │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │ 65                  │    │ 75                  │            │
│  └─────────────────────┘    └─────────────────────┘            │
│                                                                 │
│  Tax Payment Source                                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ○ From IRA (reduces conversion amount)                  │   │
│  │ ● From Taxable Accounts (recommended)                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│                                                                 │
│  ADVANCED OPTIONS                                               │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Expected Growth Rate       Inflation Rate                      │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │ 6.0%                │    │ 2.5%                │            │
│  └─────────────────────┘    └─────────────────────┘            │
│                                                                 │
│  Heir's Tax Bracket         Years to Project                    │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │ 32%             ▼   │    │ 40 years            │            │
│  └─────────────────────┘    └─────────────────────┘            │
│                                                                 │
│  ☐ Include Widow's Penalty Analysis                            │
│  ☐ Enable Sensitivity Analysis                                  │
│                                                                 │
│                                                                 │
│  ┌─────────────────┐    ┌──────────────────────────┐           │
│  │   Save Draft    │    │   Save & Calculate  →    │           │
│  └─────────────────┘    └──────────────────────────┘           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Field Inventory

| Section | Field | Type | Required | Default |
|---------|-------|------|----------|---------|
| **Personal** | Client Name | text | Yes | - |
| | Date of Birth | date | Yes | - |
| | State of Residence | select | Yes | - |
| | Filing Status | select | Yes | Married Filing Jointly |
| | Spouse DOB | date | If married | - |
| | Life Expectancy | number | No | Actuarial table |
| **Accounts** | Traditional IRA | currency | Yes | - |
| | Roth IRA | currency | No | $0 |
| | Taxable Accounts | currency | No | $0 |
| | Other Retirement | currency | No | $0 |
| **Tax** | Federal Bracket | select | Yes | Auto-detect |
| | State Tax Rate | select/auto | No | Based on state |
| | Include NIIT | checkbox | No | true |
| | Include ACA | checkbox | No | false |
| **Income** | SS Self | currency | No | $0 |
| | SS Spouse | currency | No | $0 |
| | Pension | currency | No | $0 |
| | Other Income | currency | No | $0 |
| | SS Start Age | number | No | 67 |
| **Conversion** | Strategy | radio | Yes | Moderate |
| | Start Age | number | Yes | Current age |
| | End Age | number | Yes | 75 |
| | Tax Payment Source | radio | Yes | Taxable |
| **Advanced** | Growth Rate | percent | No | 6% |
| | Inflation Rate | percent | No | 2.5% |
| | Heir Bracket | select | No | 32% |
| | Projection Years | number | No | 40 |
| | Widow Analysis | checkbox | No | false |
| | Sensitivity | checkbox | No | false |

**Total: 28 fields** (10 required, 18 optional with smart defaults)

---

## 5. Results Presentation Hierarchy

### Above the Fold (Immediate Impact)

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Homer Simpson                              [Edit] [Export ▼] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  LIFETIME WEALTH COMPARISON                                     │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │    BASELINE     │  │    BLUEPRINT    │  │   DIFFERENCE    │ │
│  │                 │  │                 │  │                 │ │
│  │    $839,409     │  │   $1,628,496    │  │   +$789,087     │ │
│  │                 │  │                 │  │     +94.0%      │ │
│  │  No conversion  │  │ Roth conversion │  │  More wealth    │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### First Scroll (The Proof)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  WEALTH TRAJECTORY                                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ $2M ─┤                                          ╱──     │   │
│  │      │                                     ╱────        │   │
│  │ $1.5M┤                               ╱─────   Blueprint │   │
│  │      │                          ╱────                   │   │
│  │ $1M ─┤                    ╱─────                        │   │
│  │      │              ╱─────                              │   │
│  │ $500K┤        ╱─────────────────────────────  Baseline  │   │
│  │      │   ╱────                                          │   │
│  │ $0  ─┼───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───  │   │
│  │      65  70  75  80  85  90  95                    Age  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  BREAKEVEN AGE: 78                                              │
│  The Blueprint strategy pays off if the client lives past 78.  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Second Scroll (Strategy Comparison)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  STRATEGY COMPARISON                                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Strategy      │ Lifetime │ Tax Cost │ IRMAA  │ Winner?  │   │
│  ├───────────────┼──────────┼──────────┼────────┼──────────┤   │
│  │ No Conversion │ $839,409 │ $0       │ $0     │          │   │
│  │ Conservative  │ $1.2M    │ $180,000 │ $0     │          │   │
│  │ Moderate ★    │ $1.63M   │ $320,000 │ $12,000│ BEST     │   │
│  │ Aggressive    │ $1.58M   │ $480,000 │ $48,000│          │   │
│  │ IRMAA-Safe    │ $1.4M    │ $240,000 │ $0     │          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Third Scroll (IRMAA & Special Analysis)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  IRMAA IMPACT                                                   │
│  Medicare premiums increase at income thresholds.               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │  [IRMAA cliff visualization - bar chart showing         │   │
│  │   income thresholds and premium increases]              │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  WIDOW'S PENALTY (if enabled)                                   │
│  After spouse passes, survivor files as Single.                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │  [Analysis of tax bracket change impact]                │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Deep Dive (Tabbed Tables)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  YEAR-BY-YEAR DETAIL                                            │
│                                                                 │
│  [Baseline] [Blueprint] [Conversion Schedule] [5-Year Tracker]  │
│  ─────────                                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Year │ Age │ IRA     │ Roth   │ RMD    │ Tax   │ Total  │   │
│  ├──────┼─────┼─────────┼────────┼────────┼───────┼────────┤   │
│  │ 2026 │ 70  │ $1.59M  │ $0     │ $0     │ $0    │ $2.09M │   │
│  │ 2027 │ 71  │ $1.69M  │ $0     │ $0     │ $0    │ $2.22M │   │
│  │ 2028 │ 72  │ $1.79M  │ $0     │ $0     │ $0    │ $2.35M │   │
│  │ ...  │ ... │ ...     │ ...    │ ...    │ ...   │ ...    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │  Download PDF    │  │  Download Excel  │                    │
│  └──────────────────┘  └──────────────────┘                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Interaction Patterns

### Real-Time Calculation

```
User Action          System Response
───────────          ───────────────
Type in field   →    Debounce (300ms)
                →    Validate field
                →    If valid, trigger recalc
                →    Show subtle loading on results
                →    Update results (< 2 sec)
                →    Animate number changes
```

### Error Handling

| Scenario | Response |
|----------|----------|
| Invalid field value | Red border, error message below field |
| Missing required field | Highlight on submit attempt |
| Server error | Toast notification with retry option |
| Calculation timeout | "Taking longer than expected" message |

### Empty States

| State | Message | CTA |
|-------|---------|-----|
| No clients | "Create your first client to get started" | [+ New Client] |
| No projections | "Run a projection to see the Blueprint advantage" | [Calculate Now] |
| Search no results | "No clients match your search" | [Clear Search] |

### Loading States

| Context | Behavior |
|---------|----------|
| Page load | Skeleton placeholders |
| Form submit | Button spinner + disabled |
| Calculation | Results area skeleton |
| PDF export | Modal with progress bar |

---

## 7. Page Inventory

| # | Page | Route | Purpose | Key Components |
|---|------|-------|---------|----------------|
| 1 | Landing | `/` | Marketing, conversion | Hero, features, CTA |
| 2 | Login | `/login` | Authentication | Auth form |
| 3 | Sign Up | `/signup` | Registration | Auth form |
| 4 | Dashboard | `/dashboard` | Home base | Stats, recent clients |
| 5 | Client List | `/clients` | Browse/search | Table, search, filters |
| 6 | New Client | `/clients/new` | Data entry | Scrolling form |
| 7 | Client Detail | `/clients/[id]` | Profile + projections | Profile card, projections list |
| 8 | Edit Client | `/clients/[id]/edit` | Modify data | Pre-filled form |
| 9 | Projection Results | `/clients/[id]/projections/[pid]` | Full analysis | Summary, chart, tables |
| 10 | Settings | `/settings` | Preferences | Settings form |
| 11 | Profile | `/settings/profile` | Account | Profile form |

**Total: 11 pages**

---

## 8. Open UX Questions

**None.** All major UX decisions have been made.

---

## Approval

- [ ] **USER APPROVAL:** I have reviewed and approve this UX research document

---

*This document defines HOW users interact with the system. Phase 3 will define WHAT it looks like.*
