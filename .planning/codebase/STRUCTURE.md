# Codebase Structure

**Analysis Date:** 2026-01-18

## Directory Layout

```
rothc/
├── app/                    # Next.js App Router pages and layouts
├── components/             # React components
│   └── ui/                 # Reusable UI primitives (shadcn-style)
├── lib/                    # Shared utilities and clients
│   └── supabase/           # Supabase client configurations
├── public/                 # Static assets
├── gameplan/               # Project planning documentation
│   └── assets/             # Planning assets
│       ├── wireframes/     # UI wireframes
│       └── data/           # Planning data files
├── .planning/              # GSD planning documents
│   └── codebase/           # Codebase analysis documents
├── middleware.ts           # Next.js middleware (auth)
├── next.config.ts          # Next.js configuration
├── tsconfig.json           # TypeScript configuration
├── package.json            # Dependencies and scripts
├── components.json         # shadcn/ui configuration
├── postcss.config.mjs      # PostCSS configuration
└── eslint.config.mjs       # ESLint configuration
```

## Directory Purposes

**app/:**
- Purpose: Next.js App Router pages and layouts
- Contains: `page.tsx`, `layout.tsx`, route groups, API routes
- Key files: `app/page.tsx` (home), `app/layout.tsx` (root layout)

**components/:**
- Purpose: Shared React components
- Contains: Feature components and UI primitives
- Key files: `components/example.tsx`, `components/component-example.tsx`

**components/ui/:**
- Purpose: Reusable UI primitives (shadcn-style)
- Contains: Base components like buttons, inputs, cards
- Key files: `button.tsx`, `card.tsx`, `input.tsx`, `select.tsx`, `dropdown-menu.tsx`, `alert-dialog.tsx`, `combobox.tsx`, `badge.tsx`, `label.tsx`, `separator.tsx`, `textarea.tsx`, `field.tsx`, `input-group.tsx`

**lib/:**
- Purpose: Shared utilities and service clients
- Contains: Helper functions and Supabase configurations
- Key files: `lib/utils.ts`

**lib/supabase/:**
- Purpose: Supabase client factories for different contexts
- Contains: Client-side, server-side, and middleware Supabase clients
- Key files: `client.ts`, `server.ts`, `middleware.ts`

**public/:**
- Purpose: Static assets served at root URL
- Contains: Images, fonts, static files
- Key files: Favicon, static images

**gameplan/:**
- Purpose: Project planning and design documentation
- Contains: Wireframes, data files, planning materials
- Key files: Planning assets and wireframes

## Key File Locations

**Entry Points:**
- `app/page.tsx`: Home page component
- `app/layout.tsx`: Root HTML layout with providers
- `middleware.ts`: Request middleware for auth

**Configuration:**
- `next.config.ts`: Next.js build and runtime config
- `tsconfig.json`: TypeScript compiler options
- `components.json`: shadcn/ui CLI configuration
- `postcss.config.mjs`: PostCSS/Tailwind processing
- `eslint.config.mjs`: Linting rules
- `.env.local`: Environment variables (Supabase keys)

**Core Logic:**
- `lib/supabase/client.ts`: Browser Supabase client
- `lib/supabase/server.ts`: Server-side Supabase client
- `lib/supabase/middleware.ts`: Session update logic
- `lib/utils.ts`: Shared utility functions (cn helper)

**Testing:**
- No test files detected in codebase

## Naming Conventions

**Files:**
- React components: `kebab-case.tsx` (e.g., `alert-dialog.tsx`, `dropdown-menu.tsx`)
- Utilities: `kebab-case.ts` (e.g., `utils.ts`)
- Pages: `page.tsx` (Next.js convention)
- Layouts: `layout.tsx` (Next.js convention)

**Directories:**
- Feature/purpose-based: lowercase (e.g., `ui`, `supabase`)
- Plural for collections: `components`, `assets`

## Where to Add New Code

**New Feature (full page):**
- Primary code: `app/[feature-name]/page.tsx`
- Layout (if needed): `app/[feature-name]/layout.tsx`
- Tests: Not established (create `app/[feature-name]/__tests__/`)

**New Component/Module:**
- UI primitive: `components/ui/[component-name].tsx`
- Feature component: `components/[component-name].tsx`
- Complex feature: `components/[feature]/[component-name].tsx`

**Utilities:**
- Shared helpers: `lib/utils.ts` or new file in `lib/`
- Service clients: `lib/[service-name]/` directory

**API Routes:**
- Location: `app/api/[route-name]/route.ts`
- Convention: Follow Next.js App Router API conventions

**Server Actions:**
- Location: `app/actions/` or co-located with feature
- Convention: `'use server'` directive at top

## Special Directories

**.next/:**
- Purpose: Next.js build output
- Generated: Yes
- Committed: No (in .gitignore)

**node_modules/:**
- Purpose: npm dependencies
- Generated: Yes
- Committed: No (in .gitignore)

**public/:**
- Purpose: Static assets served as-is
- Generated: No
- Committed: Yes

**gameplan/:**
- Purpose: Project planning documentation
- Generated: No
- Committed: Yes (project documentation)

**.planning/:**
- Purpose: GSD system codebase analysis
- Generated: Yes (by GSD tools)
- Committed: Yes (for AI context)

---

*Structure analysis: 2026-01-18*
