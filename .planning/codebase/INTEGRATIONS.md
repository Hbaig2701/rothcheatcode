# External Integrations

**Analysis Date:** 2026-01-18

## APIs & External Services

**Supabase (Backend-as-a-Service):**
- Purpose: Database, authentication, and backend services
- SDK: `@supabase/supabase-js` v2.90.1, `@supabase/ssr` v0.8.0
- Auth: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Project: `eoudmavoifpxtvjmjfqi.supabase.co`

## Data Storage

**Databases:**
- Supabase PostgreSQL (hosted)
  - Tables: profiles, clients, projections, reference_data, audit_logs
  - RLS enabled on all tables

**File Storage:**
- Supabase Storage (available but not yet used)

## Authentication & Identity

**Auth Provider:**
- Supabase Auth (built into Supabase platform)
  - Implementation: Cookie-based session management via SSR
  - Session refresh: Handled in middleware (`middleware.ts`)

**Supabase Client Setup:**

| Context | File | Function |
|---------|------|----------|
| Browser (Client Components) | `lib/supabase/client.ts` | `createClient()` |
| Server (Server Components/Actions) | `lib/supabase/server.ts` | `createClient()` |
| Middleware (Edge) | `lib/supabase/middleware.ts` | `updateSession()` |

## Environment Configuration

**Required env vars:**
```
NEXT_PUBLIC_SUPABASE_URL      # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY # Supabase anonymous/public key
```

**Secrets location:**
- `.env.local` (gitignored)

## CI/CD & Deployment

**Hosting:**
- Vercel (recommended per Next.js defaults)
- GitHub repo: `Ayy-man/rothc`

---

*Integration audit: 2026-01-18*
