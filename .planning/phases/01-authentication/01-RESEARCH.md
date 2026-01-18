# Phase 01: Authentication - Research

**Researched:** 2026-01-18
**Domain:** Supabase Auth with Next.js 15 App Router
**Confidence:** HIGH

## Summary

This phase implements authentication for a Roth IRA conversion optimizer app using Supabase Auth with Next.js 15 App Router. The existing codebase already has Supabase SSR client utilities configured correctly (`@supabase/ssr` v0.8.0) with browser client, server client, and middleware session refresh patterns in place.

The standard approach for Supabase Auth with Next.js App Router uses cookie-based sessions managed through middleware. Authentication operations (signup, login, magic link, OAuth) are implemented via Server Actions that call Supabase Auth methods. Protected routes verify the user via `getUser()` (never `getSession()`). A callback route handler at `/auth/callback` exchanges OAuth/magic link codes for sessions.

**Primary recommendation:** Use Server Actions for all auth operations, implement route protection at the page level with `getUser()`, and use the official shadcn/ui sidebar component for the dashboard layout.

## Standard Stack

The established libraries/tools for this domain:

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/ssr` | ^0.8.0 | SSR auth cookie handling | Official Supabase SSR package, replaces deprecated auth-helpers |
| `@supabase/supabase-js` | ^2.90.1 | Supabase client SDK | Core Supabase functionality |
| `next` | 16.1.3 | Framework | App Router with Server Actions support |
| `shadcn/ui` | (registry) | UI components | Form inputs, buttons, cards for auth UI |

### Supporting (Need to Add)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `shadcn sidebar` | (component) | Dashboard sidebar | Install via `npx shadcn@latest add sidebar` |
| `lucide-react` | ^0.562.0 | Icons | Already installed, use for auth form icons |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Server Actions | Route Handlers | Server Actions are simpler, no API endpoint management |
| Cookie storage | localStorage | localStorage is XSS vulnerable, not SSR compatible |
| `getUser()` | `getSession()` | `getSession()` only checks local JWT, not server-validated |

**Installation:**
```bash
npx shadcn@latest add sidebar
```

## Architecture Patterns

### Recommended Project Structure
```
app/
├── (auth)/                    # Auth routes (public)
│   ├── login/
│   │   └── page.tsx          # Login page with form
│   ├── signup/
│   │   └── page.tsx          # Signup page with form
│   └── auth/
│       ├── callback/
│       │   └── route.ts      # OAuth/magic link callback handler
│       └── confirm/
│           └── route.ts      # Email confirmation handler
├── (dashboard)/               # Protected routes
│   ├── layout.tsx            # Dashboard layout with sidebar
│   └── dashboard/
│       └── page.tsx          # Main dashboard page
├── layout.tsx                # Root layout
└── page.tsx                  # Landing page
lib/
├── supabase/
│   ├── client.ts             # Browser client (EXISTS)
│   ├── server.ts             # Server client (EXISTS)
│   └── middleware.ts         # Session update (EXISTS)
└── actions/
    └── auth.ts               # Server actions for auth
middleware.ts                 # Root middleware (EXISTS)
```

### Pattern 1: Server Actions for Auth Operations
**What:** All authentication operations (login, signup, logout) use Server Actions
**When to use:** Always for form submissions in App Router
**Example:**
```typescript
// lib/actions/auth.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function signup(formData: FormData) {
  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  redirect('/login?message=Check your email to confirm your account')
}

export async function signInWithGoogle() {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  })

  if (error) {
    return { error: error.message }
  }

  redirect(data.url)
}

export async function signInWithMagicLink(formData: FormData) {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithOtp({
    email: formData.get('email') as string,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  })

  if (error) {
    return { error: error.message }
  }

  return { success: 'Check your email for the magic link' }
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
```

### Pattern 2: Auth Callback Route Handler
**What:** Route handler that exchanges auth codes for sessions
**When to use:** Required for OAuth and magic link flows
**Example:**
```typescript
// app/(auth)/auth/callback/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return to login with error
  return NextResponse.redirect(`${origin}/login?error=Could not authenticate`)
}
```

### Pattern 3: Protected Page with getUser()
**What:** Server Component that validates user before rendering
**When to use:** Every protected page/layout
**Example:**
```typescript
// app/(dashboard)/dashboard/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  return (
    <div>
      <h1>Welcome, {user.email}</h1>
    </div>
  )
}
```

### Pattern 4: Dashboard Layout with Sidebar
**What:** Shared layout for all dashboard pages with sidebar navigation
**When to use:** All protected routes under (dashboard)
**Example:**
```typescript
// app/(dashboard)/layout.tsx
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get('sidebar_state')?.value === 'true'

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar user={user} />
      <main className="flex-1">
        <SidebarTrigger />
        {children}
      </main>
    </SidebarProvider>
  )
}
```

### Anti-Patterns to Avoid
- **Using `getSession()` for auth checks:** Only validates local JWT, not server-verified. Use `getUser()` instead.
- **Auth checks in layouts only:** Layouts don't re-run on every navigation due to Partial Rendering. Check auth in each page.
- **Storing tokens in localStorage:** XSS vulnerable, not SSR compatible. Cookies are handled automatically by `@supabase/ssr`.
- **Using deprecated `@supabase/auth-helpers-nextjs`:** Migrate to `@supabase/ssr`.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session refresh | Manual token refresh logic | Middleware `updateSession()` | Already configured, handles edge cases |
| Cookie management | Manual cookie get/set | `@supabase/ssr` utilities | Handles secure, httpOnly, sameSite correctly |
| OAuth flow | Custom OAuth implementation | `signInWithOAuth()` | Supabase handles PKCE, redirects, token exchange |
| Magic link | Custom email token system | `signInWithOtp()` | Supabase manages token generation, expiry |
| Form validation | Custom validation | Zod + Server Actions | Type-safe, server-side validation |
| Sidebar component | Custom sidebar | shadcn/ui sidebar | Responsive, accessible, state persistence |
| Auth UI components | Custom forms | shadcn/ui form components | Consistent styling, accessibility |

**Key insight:** Supabase Auth handles all the cryptographic and session management complexity. Your job is to wire up the UI and route protection, not reimplement auth primitives.

## Common Pitfalls

### Pitfall 1: Using getSession() Instead of getUser()
**What goes wrong:** Session data can be spoofed since it only validates local JWT signature
**Why it happens:** `getSession()` is simpler and doesn't make a network request
**How to avoid:** Always use `getUser()` for server-side auth checks - it validates with Supabase servers
**Warning signs:** User can access protected content after logout, or by modifying cookies

### Pitfall 2: Auth Checks Only in Layouts
**What goes wrong:** User can navigate to protected pages without re-checking auth
**Why it happens:** Next.js Partial Rendering doesn't re-run layout code on soft navigations
**How to avoid:** Check auth in each protected page component, not just the layout
**Warning signs:** Protected content briefly visible after logout before redirect

### Pitfall 3: OAuth Redirect Loop
**What goes wrong:** User gets stuck in infinite redirect after OAuth
**Why it happens:** Callback URL not configured in Supabase dashboard, or code exchange fails
**How to avoid:**
  1. Configure exact callback URL in Supabase Dashboard > Auth > URL Configuration
  2. Handle errors in callback route with fallback redirect to login
**Warning signs:** Browser shows "too many redirects" error

### Pitfall 4: Magic Link Opens in Wrong Browser
**What goes wrong:** `AuthApiError: both auth code and code verifier should be non-empty`
**Why it happens:** PKCE code verifier is stored in original browser, but user clicks link in different browser/email client
**How to avoid:** Use token_hash flow via `verifyOtp()` instead of code exchange for email links
**Warning signs:** Magic links work on desktop but fail on mobile email apps

### Pitfall 5: Route Prefetching Breaks Auth
**What goes wrong:** Prefetched routes don't have auth cookies, showing unauthenticated state briefly
**Why it happens:** `<Link>` prefetches before browser sets auth cookies from hash params
**How to avoid:** Use `prefetch={false}` on links to protected routes, or handle flash properly
**Warning signs:** Brief flash of login screen before redirect to dashboard

### Pitfall 6: Missing Email Confirmation Redirect
**What goes wrong:** User clicks email confirmation link and lands on wrong page
**Why it happens:** `emailRedirectTo` option not set or points to wrong URL
**How to avoid:** Always set `emailRedirectTo` in signup and magic link options
**Warning signs:** Users confused after clicking email link

### Pitfall 7: Environment Variable Misconfiguration
**What goes wrong:** Auth fails silently or redirects to localhost in production
**Why it happens:** `NEXT_PUBLIC_SITE_URL` not set or wrong in production
**How to avoid:** Verify all env vars in production: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`
**Warning signs:** OAuth redirects to localhost:3000 in production

## Code Examples

Verified patterns from official sources:

### Login Form Component
```typescript
// app/(auth)/login/page.tsx
import { login, signInWithGoogle, signInWithMagicLink } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

export default function LoginPage({
  searchParams,
}: {
  searchParams: { message?: string; error?: string }
}) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign In</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {searchParams.message && (
            <p className="text-sm text-green-600">{searchParams.message}</p>
          )}
          {searchParams.error && (
            <p className="text-sm text-red-600">{searchParams.error}</p>
          )}

          <form className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required />
            </div>
            <Button formAction={login} className="w-full">
              Sign In
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or</span>
            </div>
          </div>

          <form>
            <Button formAction={signInWithGoogle} variant="outline" className="w-full">
              Continue with Google
            </Button>
          </form>

          <form className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="magic-email">Magic Link</Label>
              <Input id="magic-email" name="email" type="email" placeholder="Enter email for magic link" />
            </div>
            <Button formAction={signInWithMagicLink} variant="secondary" className="w-full">
              Send Magic Link
            </Button>
          </form>

          <p className="text-center text-sm">
            Don't have an account?{' '}
            <Link href="/signup" className="underline">Sign up</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
```

### Email Confirmation Route Handler
```typescript
// app/(auth)/auth/confirm/route.ts
import { type EmailOtpType } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/dashboard'

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    })

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=Could not verify email`)
}
```

### Logout Button Component
```typescript
// components/logout-button.tsx
'use client'

import { logout } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'

export function LogoutButton() {
  return (
    <form action={logout}>
      <Button type="submit" variant="ghost">
        Sign Out
      </Button>
    </form>
  )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` | 2024 | Must migrate, auth-helpers deprecated |
| `getSession()` for server auth | `getUser()` for server auth | 2024 | Security: getSession can be spoofed |
| Implicit OAuth flow | PKCE flow | 2024 | More secure, required for SSR |
| Client-side auth state | Cookie-based sessions | 2024 | Better SSR support, more secure |
| Pages Router patterns | App Router Server Actions | 2024 | Simpler, no API routes needed |

**Deprecated/outdated:**
- `@supabase/auth-helpers-nextjs`: Replaced by `@supabase/ssr`, no longer maintained
- `supabase.auth.getSession()` in server code: Use `getUser()` which validates with server
- `sb_publishable_` keys: Transitional, older `anon` keys still work

## Open Questions

Things that couldn't be fully resolved:

1. **Supabase UI Library Components**
   - What we know: Supabase released a UI library built on shadcn/ui with pre-built auth components
   - What's unclear: Exact installation command and component names for Next.js App Router
   - Recommendation: Build auth forms manually with existing shadcn/ui components (already installed). The custom approach is well-documented and more flexible.

2. **Email Template Customization**
   - What we know: Supabase allows customizing confirmation emails via dashboard
   - What's unclear: Whether custom templates are needed for this phase
   - Recommendation: Use default templates for now, can customize later if needed

## Sources

### Primary (HIGH confidence)
- [Supabase Server-Side Auth for Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs) - Core SSR patterns
- [Supabase Auth Quickstart Next.js](https://supabase.com/docs/guides/auth/quickstarts/nextjs) - Official quickstart
- [Supabase Password-based Auth](https://supabase.com/docs/guides/auth/passwords) - Email/password flow
- [Supabase Magic Links](https://supabase.com/docs/guides/auth/auth-email-passwordless) - OTP/magic link flow
- [Supabase Google OAuth](https://supabase.com/docs/guides/auth/social-login/auth-google) - Google sign-in setup
- [shadcn/ui Sidebar](https://ui.shadcn.com/docs/components/sidebar) - Dashboard sidebar component

### Secondary (MEDIUM confidence)
- [Supabase Troubleshooting Guide](https://supabase.com/docs/guides/troubleshooting/how-do-you-troubleshoot-nextjs---supabase-auth-issues-riMCZV) - Common issues
- [Next.js Authentication Guide](https://nextjs.org/docs/app/guides/authentication) - Framework patterns
- [2025 Cookie-Based Auth Guide](https://the-shubham.medium.com/next-js-supabase-cookie-based-auth-workflow-the-best-auth-solution-2025-guide-f6738b4673c1) - Modern patterns

### Tertiary (LOW confidence)
- Various GitHub discussions on redirect loops and edge cases

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official Supabase packages already installed and configured
- Architecture: HIGH - Patterns directly from official Supabase documentation
- Pitfalls: HIGH - Well-documented issues in troubleshooting guides and discussions
- Code Examples: MEDIUM - Synthesized from multiple official sources, may need minor adjustments

**Research date:** 2026-01-18
**Valid until:** 2026-02-18 (30 days - stable ecosystem)
