# Architecture

**Analysis Date:** 2026-01-18

## Pattern Overview

**Overall:** Next.js App Router with Supabase Backend

**Key Characteristics:**
- Server-side rendering with React Server Components (Next.js 16)
- Authentication handled via Supabase SSR middleware
- Component-based UI architecture using Base UI and shadcn patterns
- Tailwind CSS for styling with class-variance-authority for component variants

## Layers

**Presentation Layer:**
- Purpose: UI rendering and user interaction
- Location: `app/` and `components/`
- Contains: Pages, layouts, UI components
- Depends on: lib utilities, Supabase clients
- Used by: End users via browser

**Middleware Layer:**
- Purpose: Request interception for auth session management
- Location: `middleware.ts`
- Contains: Next.js middleware for session refresh
- Depends on: `lib/supabase/middleware.ts`
- Used by: All incoming requests (except static assets)

**Data Access Layer:**
- Purpose: Database and authentication operations
- Location: `lib/supabase/`
- Contains: Client and server Supabase client factories
- Depends on: @supabase/ssr, @supabase/supabase-js
- Used by: Presentation layer, middleware

**Utilities Layer:**
- Purpose: Shared helper functions
- Location: `lib/utils.ts`
- Contains: Utility functions (likely cn() for className merging)
- Depends on: clsx, tailwind-merge
- Used by: All components

## Data Flow

**Authentication Flow:**

1. Request hits Next.js middleware (`middleware.ts`)
2. Middleware calls `updateSession()` from `lib/supabase/middleware.ts`
3. Session refreshed/validated via Supabase SSR
4. Request continues to page or redirected if auth required

**Page Render Flow:**

1. Request routed via App Router to `app/` page
2. Layout wraps page content (`app/layout.tsx`)
3. Page fetches data using server-side Supabase client (`lib/supabase/server.ts`)
4. React components render with fetched data

**Client Interaction Flow:**

1. Client-side components use browser Supabase client (`lib/supabase/client.ts`)
2. Real-time subscriptions or mutations go directly to Supabase
3. UI updates via React state management

**State Management:**
- React Server Components for server state
- Client components use React hooks for local state
- Supabase handles auth state persistence

## Key Abstractions

**Supabase Client Factory:**
- Purpose: Create appropriately configured Supabase clients
- Examples: `lib/supabase/client.ts`, `lib/supabase/server.ts`
- Pattern: Factory pattern with environment-specific configuration

**UI Components:**
- Purpose: Reusable styled components
- Examples: `components/ui/button.tsx`, `components/ui/card.tsx`
- Pattern: shadcn-style components with CVA variants

**Route Segments:**
- Purpose: URL-based page organization
- Examples: `app/page.tsx`, `app/layout.tsx`
- Pattern: Next.js App Router file-based routing

## Entry Points

**Web Application:**
- Location: `app/page.tsx`
- Triggers: HTTP requests to root URL
- Responsibilities: Render home page

**Root Layout:**
- Location: `app/layout.tsx`
- Triggers: All page renders
- Responsibilities: HTML structure, global providers, metadata

**Middleware:**
- Location: `middleware.ts`
- Triggers: All requests except static assets (see matcher config)
- Responsibilities: Supabase session refresh

## Error Handling

**Strategy:** Default Next.js error handling (no custom error boundaries detected)

**Patterns:**
- Async/await with implicit error propagation
- Supabase client handles auth errors internally

## Cross-Cutting Concerns

**Logging:** Console-based (no structured logging framework detected)
**Validation:** Not explicitly configured (relies on TypeScript types)
**Authentication:** Supabase Auth via SSR middleware with cookie-based sessions

---

*Architecture analysis: 2026-01-18*
