# Codebase Concerns

**Analysis Date:** 2026-01-18

## Tech Debt

**Non-Null Assertions on Environment Variables:**
- Issue: Environment variables accessed with `!` without runtime validation
- Files: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/middleware.ts`
- Fix: Add environment variable validation at app startup

**Unused UI Components:**
- Issue: Large component library but most not used in actual application
- Files: `components/ui/*.tsx`, `components/component-example.tsx`
- Fix: Remove unused components or keep for future use

**Silent Error Swallowing:**
- Issue: Empty catch block in `lib/supabase/server.ts`
- Fix: Add error logging or explanatory comment

## Security Considerations

**Supabase Key Exposure:**
- Risk: `.env.local` contains credentials
- Mitigation: `.env.local` is in `.gitignore`
- Recommendation: Verify not tracked in git

**No Rate Limiting:**
- Risk: No rate limiting on middleware
- Recommendation: Add before production

## Performance Bottlenecks

**Middleware Session Check on Every Request:**
- Problem: `supabase.auth.getUser()` called on every non-static request
- Improvement: Consider caching or only on protected routes

**Multiple Google Fonts Loaded:**
- Problem: Three font families loaded (Nunito Sans, Geist, Geist Mono)
- Improvement: Reduce to only fonts used

## Missing Critical Features

**No Authentication UI:**
- Problem: Supabase auth configured but no login/signup pages
- Blocks: Cannot test auth flow

**No Error Boundaries:**
- Problem: No React error boundaries
- Blocks: Component errors crash entire app

**No Loading States:**
- Problem: No loading skeletons or suspense boundaries
- Blocks: Poor UX during async operations

## Test Coverage Gaps

**Zero Test Coverage:**
- What's not tested: Entire application
- Risk: Refactoring could break functionality unnoticed
- Priority: High - add tests before building features

---

*Concerns audit: 2026-01-18*
