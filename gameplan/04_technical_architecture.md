# Technical Architecture Document

**Generated:** 2026-01-18
**Status:** APPROVED

---

## 1. Tech Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Framework | Next.js 15 (App Router) | SSR, API routes, file-based routing |
| Language | TypeScript | Type safety, better DX |
| Styling | Tailwind CSS | Utility-first, matches shadcn |
| Components | shadcn/ui | Copy-paste, full control |
| Database | Supabase (PostgreSQL) | Managed, auth included, realtime |
| Auth | Supabase Auth | Email, magic link, Google SSO |
| Charts | Recharts | React-native, declarative |
| Forms | React Hook Form + Zod | Validation, performance |
| State | React Query (TanStack) | Server state caching |
| PDF | @react-pdf/renderer | React-based PDF generation |
| Excel | xlsx (SheetJS) | Client-side XLSX generation |
| Hosting | Vercel | Native Next.js, edge functions |

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                              CLIENT                                  │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                      Next.js App (App Router)                  │  │
│  │                                                                │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │  │
│  │  │  Pages   │  │Components│  │  Hooks   │  │  Utils   │      │  │
│  │  │ (routes) │  │(shadcn+) │  │(queries) │  │(calc,fmt)│      │  │
│  │  └────┬─────┘  └──────────┘  └────┬─────┘  └──────────┘      │  │
│  │       │                           │                           │  │
│  │       ▼                           ▼                           │  │
│  │  ┌─────────────────────────────────────────────────────────┐ │  │
│  │  │              React Query Cache (TanStack)                │ │  │
│  │  └─────────────────────────┬───────────────────────────────┘ │  │
│  └────────────────────────────┼─────────────────────────────────┘  │
└───────────────────────────────┼─────────────────────────────────────┘
                                │ HTTPS / API calls
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                              SERVER                                  │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Next.js API Routes                          │  │
│  │                                                                │  │
│  │  /api/clients/*          /api/projections/*     /api/export/* │  │
│  │                                                                │  │
│  │  ┌──────────────────────────────────────────────────────────┐ │  │
│  │  │                 CALCULATION ENGINE                        │ │  │
│  │  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐     │ │  │
│  │  │  │   RMD   │  │ Federal │  │  State  │  │  IRMAA  │     │ │  │
│  │  │  │  Calc   │  │   Tax   │  │   Tax   │  │  Calc   │     │ │  │
│  │  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘     │ │  │
│  │  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐     │ │  │
│  │  │  │  NIIT   │  │   ACA   │  │ Widow's │  │Breakeven│     │ │  │
│  │  │  │  Calc   │  │ Subsidy │  │ Penalty │  │ Analysis│     │ │  │
│  │  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘     │ │  │
│  │  └──────────────────────────────────────────────────────────┘ │  │
│  │                                                                │  │
│  │  ┌──────────────────────────────────────────────────────────┐ │  │
│  │  │                 Supabase Client                           │ │  │
│  │  └──────────────────────────┬───────────────────────────────┘ │  │
│  └─────────────────────────────┼─────────────────────────────────┘  │
└────────────────────────────────┼────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           SUPABASE                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  PostgreSQL  │  │     Auth     │  │   Storage    │              │
│  │   Database   │  │   Service    │  │   (PDFs)     │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Database Schema

```sql
-- Users (managed by Supabase Auth, extended)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clients
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Personal Info
  name TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  state TEXT NOT NULL,
  filing_status TEXT NOT NULL,
  spouse_dob DATE,
  life_expectancy INTEGER,

  -- Account Balances
  traditional_ira NUMERIC NOT NULL,
  roth_ira NUMERIC DEFAULT 0,
  taxable_accounts NUMERIC DEFAULT 0,
  other_retirement NUMERIC DEFAULT 0,

  -- Tax Config
  federal_bracket TEXT,
  state_tax_rate NUMERIC,
  include_niit BOOLEAN DEFAULT true,
  include_aca BOOLEAN DEFAULT false,

  -- Income Sources
  ss_self NUMERIC DEFAULT 0,
  ss_spouse NUMERIC DEFAULT 0,
  pension NUMERIC DEFAULT 0,
  other_income NUMERIC DEFAULT 0,
  ss_start_age INTEGER DEFAULT 67,

  -- Conversion Settings
  conversion_strategy TEXT NOT NULL,
  conversion_start_age INTEGER NOT NULL,
  conversion_end_age INTEGER NOT NULL,
  tax_payment_source TEXT DEFAULT 'taxable',

  -- Advanced Options
  growth_rate NUMERIC DEFAULT 0.06,
  inflation_rate NUMERIC DEFAULT 0.025,
  heir_bracket TEXT DEFAULT '32',
  projection_years INTEGER DEFAULT 40,
  include_widow_analysis BOOLEAN DEFAULT false,
  include_sensitivity BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clients_user ON clients(user_id);

-- Projections
CREATE TABLE projections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Snapshot of inputs at calculation time
  inputs JSONB NOT NULL,

  -- Results
  baseline_results JSONB NOT NULL,      -- Year-by-year for baseline
  blueprint_results JSONB NOT NULL,     -- Year-by-year for blueprint
  strategy_comparison JSONB NOT NULL,   -- All 4 strategies summary
  summary JSONB NOT NULL,               -- Lifetime totals, breakeven, etc.

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projections_client ON projections(client_id);
CREATE INDEX idx_projections_created ON projections(created_at DESC);

-- Reference Tables (tax brackets, IRMAA thresholds, RMD factors)
CREATE TABLE reference_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,             -- 'tax_brackets_2026', 'irmaa_2026', 'rmd_factors'
  tax_year INTEGER,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(table_name, tax_year)
);

-- Audit Log
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL,                 -- 'projection_created', 'client_updated', etc.
  resource_type TEXT NOT NULL,          -- 'client', 'projection'
  resource_id UUID,
  metadata JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
```

---

## 4. API Routes

### Authentication (handled by Supabase)
- `POST /auth/signup` - Register
- `POST /auth/login` - Login
- `POST /auth/logout` - Logout
- `POST /auth/magic-link` - Passwordless
- `GET /auth/callback` - OAuth callback

### Clients
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/clients` | List user's clients |
| POST | `/api/clients` | Create client |
| GET | `/api/clients/[id]` | Get client detail |
| PUT | `/api/clients/[id]` | Update client |
| DELETE | `/api/clients/[id]` | Delete client |

### Projections
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/clients/[id]/projections` | Run new projection |
| GET | `/api/clients/[id]/projections` | List projections for client |
| GET | `/api/projections/[id]` | Get projection detail |
| DELETE | `/api/projections/[id]` | Delete projection |

### Exports
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/projections/[id]/pdf` | Generate PDF report |
| GET | `/api/projections/[id]/xlsx` | Generate Excel file |

### Reference Data
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/reference/tax-brackets` | Get tax brackets |
| GET | `/api/reference/irmaa` | Get IRMAA thresholds |
| GET | `/api/reference/rmd-factors` | Get RMD table |
| GET | `/api/reference/states` | Get state tax rates |

---

## 5. Folder Structure

```
/rothc
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/
│   │   ├── dashboard/page.tsx
│   │   ├── clients/
│   │   │   ├── page.tsx                    # Client list
│   │   │   ├── new/page.tsx                # New client form
│   │   │   └── [id]/
│   │   │       ├── page.tsx                # Client detail
│   │   │       ├── edit/page.tsx           # Edit client
│   │   │       └── projections/
│   │   │           └── [pid]/page.tsx      # Projection results
│   │   ├── settings/
│   │   │   ├── page.tsx
│   │   │   └── profile/page.tsx
│   │   └── layout.tsx                      # Dashboard layout (sidebar)
│   ├── api/
│   │   ├── clients/
│   │   │   ├── route.ts                    # GET, POST
│   │   │   └── [id]/
│   │   │       ├── route.ts                # GET, PUT, DELETE
│   │   │       └── projections/route.ts    # GET, POST
│   │   ├── projections/
│   │   │   └── [id]/
│   │   │       ├── route.ts                # GET, DELETE
│   │   │       ├── pdf/route.ts
│   │   │       └── xlsx/route.ts
│   │   └── reference/
│   │       ├── tax-brackets/route.ts
│   │       ├── irmaa/route.ts
│   │       ├── rmd-factors/route.ts
│   │       └── states/route.ts
│   ├── layout.tsx
│   ├── page.tsx                            # Landing page
│   └── globals.css
├── components/
│   ├── ui/                                 # shadcn components
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── card.tsx
│   │   └── ...
│   ├── forms/
│   │   ├── client-form.tsx
│   │   ├── form-section.tsx
│   │   └── currency-input.tsx
│   ├── charts/
│   │   ├── wealth-chart.tsx
│   │   ├── irmaa-chart.tsx
│   │   └── strategy-chart.tsx
│   ├── results/
│   │   ├── stat-card.tsx
│   │   ├── strategy-table.tsx
│   │   └── year-table.tsx
│   └── layout/
│       ├── sidebar.tsx
│       ├── page-header.tsx
│       └── dashboard-layout.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts                       # Browser client
│   │   ├── server.ts                       # Server client
│   │   └── middleware.ts
│   ├── calculations/
│   │   ├── engine.ts                       # Main calculation orchestrator
│   │   ├── rmd.ts                          # RMD calculations
│   │   ├── federal-tax.ts                  # Federal tax brackets
│   │   ├── state-tax.ts                    # State tax calculations
│   │   ├── irmaa.ts                        # IRMAA calculations
│   │   ├── niit.ts                         # Net Investment Income Tax
│   │   ├── aca.ts                          # ACA subsidy calculations
│   │   ├── widow.ts                        # Widow's penalty analysis
│   │   ├── breakeven.ts                    # Breakeven age analysis
│   │   └── strategies.ts                   # Strategy implementations
│   ├── export/
│   │   ├── pdf.tsx                         # PDF generation
│   │   └── xlsx.ts                         # Excel generation
│   ├── utils/
│   │   ├── format.ts                       # Currency, percent formatting
│   │   ├── dates.ts                        # Date utilities
│   │   └── validation.ts                   # Zod schemas
│   └── hooks/
│       ├── use-clients.ts                  # Client queries
│       ├── use-projections.ts              # Projection queries
│       └── use-calculation.ts              # Calculation mutation
├── types/
│   ├── client.ts
│   ├── projection.ts
│   └── calculation.ts
├── data/
│   ├── tax-brackets.json
│   ├── irmaa-thresholds.json
│   ├── rmd-factors.json
│   └── state-taxes.json
└── ...config files
```

---

## 6. Calculation Engine Overview

### Input → Output Flow

```
ClientProfile (28 fields)
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│                  CALCULATION ENGINE                        │
│                                                           │
│  1. Parse inputs, apply defaults                          │
│  2. Load reference data (tax brackets, IRMAA, RMD)        │
│  3. For each strategy (Conservative, Moderate, etc.):     │
│     a. Run year-by-year simulation (age → life expectancy)│
│     b. Calculate: RMDs, conversions, taxes, IRMAA, growth │
│     c. Sum lifetime distributions, taxes, heir taxes      │
│  4. Compare strategies, find optimal                      │
│  5. Calculate breakeven age                               │
│  6. Generate IRMAA impact analysis                        │
│  7. Generate widow's penalty analysis (if enabled)        │
│  8. Generate sensitivity analysis (if enabled)            │
│  9. Return structured results                             │
│                                                           │
└───────────────────────────────────────────────────────────┘
        │
        ▼
ProjectionResults {
  baseline: YearResult[],
  blueprint: YearResult[],
  strategyComparison: StrategySummary[],
  summary: {
    lifetimeWealthBaseline,
    lifetimeWealthBlueprint,
    difference,
    breakEvenAge,
    irmaaImpact,
    ...
  }
}
```

### Key Calculation Modules

| Module | Responsibility |
|--------|----------------|
| `rmd.ts` | Required Minimum Distribution by age |
| `federal-tax.ts` | Progressive federal brackets |
| `state-tax.ts` | State-specific tax (50 states) |
| `irmaa.ts` | Medicare premium surcharges |
| `niit.ts` | 3.8% Net Investment Income Tax |
| `aca.ts` | ACA subsidy cliff calculations |
| `widow.ts` | Single-filer impact after spouse death |
| `breakeven.ts` | Age when conversion pays off |
| `strategies.ts` | Conservative/Moderate/Aggressive/IRMAA-Safe logic |

---

## 7. Performance Targets

| Metric | Target |
|--------|--------|
| Calculation time | < 2 seconds |
| Page load (dashboard) | < 1 second |
| Form input response | < 50ms |
| PDF generation | < 5 seconds |
| Excel generation | < 3 seconds |

---

## 8. Security Considerations

- **Auth:** Supabase handles password hashing, session tokens
- **RLS:** Row-Level Security on all tables (users see only their data)
- **API:** All routes require authentication
- **Input validation:** Zod schemas on all inputs
- **HTTPS:** Enforced by Vercel
- **Audit trail:** All mutations logged

---

*This document defines the technical implementation. See Sprint Plan for phased delivery.*
