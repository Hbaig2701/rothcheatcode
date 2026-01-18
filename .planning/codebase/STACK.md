# Technology Stack

**Analysis Date:** 2026-01-18

## Languages

**Primary:**
- TypeScript 5.x - All application code (`.ts`, `.tsx` files)

**Secondary:**
- CSS - Styling via Tailwind CSS v4 (`app/globals.css`)

## Runtime

**Environment:**
- Node.js v22.17.0
- Browser (React client components)

**Package Manager:**
- npm v10.9.2
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- Next.js 16.1.3 - Full-stack React framework with App Router
- React 19.2.3 - UI library (latest version with Server Components)
- React DOM 19.2.3 - React renderer for web

**UI Components:**
- shadcn/ui 3.7.0 - Component library (base-vega style)
- @base-ui/react 1.1.0 - Unstyled primitive components
- Lucide React 0.562.0 - Icon library

**Styling:**
- Tailwind CSS 4.x - Utility-first CSS framework
- @tailwindcss/postcss 4.x - PostCSS integration
- class-variance-authority 0.7.1 - Variant styling utility
- clsx 2.1.1 - Class name utility
- tailwind-merge 3.4.0 - Tailwind class merging
- tw-animate-css 1.4.0 - Animation utilities

**Build/Dev:**
- ESLint 9.x - Linting
- eslint-config-next 16.1.3 - Next.js ESLint rules
- PostCSS - CSS processing

## Key Dependencies

**Critical:**
- @supabase/ssr 0.8.0 - Supabase SSR integration for auth/data
- @supabase/supabase-js 2.90.1 - Supabase JavaScript client

**Infrastructure:**
- next/font - Google Fonts optimization (Geist, Nunito Sans)

## Configuration

**TypeScript:**
- Config: `tsconfig.json`
- Target: ES2017
- Module: ESNext with bundler resolution
- Strict mode: enabled
- Path aliases: `@/*` maps to project root

**Build:**
- `next.config.ts` - Next.js configuration
- `postcss.config.mjs` - PostCSS with Tailwind
- `eslint.config.mjs` - ESLint flat config with Next.js rules
- `components.json` - shadcn/ui configuration

**Environment Variables:**
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL (required)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key (required)
- Location: `.env.local`

## Scripts

```bash
npm run dev    # Start development server
npm run build  # Production build
npm run start  # Start production server
npm run lint   # Run ESLint
```

---

*Stack analysis: 2026-01-18*
