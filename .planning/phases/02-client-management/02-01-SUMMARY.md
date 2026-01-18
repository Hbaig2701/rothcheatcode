---
phase: 02
plan: 01
subsystem: client-management
tags: [tanstack-query, react-hook-form, zod, shadcn-table]

dependency-graph:
  requires: []
  provides:
    - TanStack Query infrastructure
    - Client TypeScript types
    - Zod validation schemas
    - shadcn Table component
  affects:
    - 02-02 (Client list table)
    - 02-03 (Create client form)
    - 02-04 (Edit/delete operations)
    - 02-05 (API routes)

tech-stack:
  added:
    - "@tanstack/react-query@5.90.19"
    - "@tanstack/react-query-devtools@5.91.2"
    - "@tanstack/react-table@8.21.3"
    - "react-hook-form@7.71.1"
    - "@hookform/resolvers@5.2.2"
    - "zod@4.3.5"
  patterns:
    - QueryProvider context wrapper
    - Zod schema-first validation
    - Type inference from Zod schemas

key-files:
  created:
    - lib/types/client.ts
    - lib/validations/client.ts
    - components/providers/query-provider.tsx
    - components/ui/table.tsx
  modified:
    - package.json
    - package-lock.json
    - app/layout.tsx

decisions:
  - id: zod-v4-api
    description: "Used Zod v4 API syntax (message instead of errorMap) for enum validation"
    rationale: "Project uses Zod v4 which has different API than v3"

metrics:
  duration: "2m 15s"
  completed: "2026-01-18"
---

# Phase 02 Plan 01: Foundation - Dependencies, Types, and Query Provider Summary

**One-liner:** Installed TanStack Query/Table, react-hook-form, Zod with QueryProvider wrapper and Client types/schemas.

## What Was Built

### 1. Dependency Installation
Installed all required libraries for client CRUD operations:
- **@tanstack/react-query** - Server state management
- **@tanstack/react-query-devtools** - Development debugging tools
- **@tanstack/react-table** - Headless table for client list
- **react-hook-form** - Form state management
- **@hookform/resolvers** - Zod integration for react-hook-form
- **zod** - Schema validation

### 2. Client Types (`lib/types/client.ts`)
```typescript
export interface Client {
  id: string;
  user_id: string;
  name: string;
  date_of_birth: string;
  state: string;
  filing_status: "single" | "married_filing_jointly" | "married_filing_separately" | "head_of_household";
  created_at: string;
  updated_at: string;
}

export type ClientInsert = Omit<Client, "id" | "user_id" | "created_at" | "updated_at">;
export type ClientUpdate = Partial<ClientInsert>;
```

### 3. Validation Schemas (`lib/validations/client.ts`)
```typescript
export const clientCreateSchema = z.object({
  name: z.string().min(1).max(100),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  state: z.string().length(2),
  filing_status: z.enum([...]),
});

export const clientUpdateSchema = clientCreateSchema.partial();
```

### 4. QueryProvider (`components/providers/query-provider.tsx`)
- Wraps app in QueryClientProvider
- 1 minute stale time for queries
- Disabled refetch on window focus
- ReactQueryDevtools for development

### 5. Table Component (`components/ui/table.tsx`)
- shadcn/ui Table primitives
- Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption, TableFooter

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed Zod v4 API compatibility**
- **Found during:** Task 2
- **Issue:** Plan used Zod v3 `errorMap` option which doesn't exist in Zod v4
- **Fix:** Changed to Zod v4 `message` option for enum validation
- **Files modified:** lib/validations/client.ts
- **Commit:** 2ae2286

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Zod API version | Used v4 syntax | Project has Zod v4 installed which uses `message` not `errorMap` |
| Stale time | 1 minute | Balance between fresh data and reducing server calls |
| Window focus refetch | Disabled | Advisor workflow doesn't need aggressive refetching |

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 042e2da | chore | Install TanStack Query, Table, react-hook-form, and Zod |
| 2ae2286 | feat | Create Client types and Zod validation schemas |
| 28820eb | feat | Set up TanStack Query provider and add shadcn Table |

## Next Phase Readiness

**Ready for 02-02 (Client List Table):**
- [x] TanStack Table installed and available
- [x] Client type defined for table data
- [x] QueryProvider in place for data fetching
- [x] Table UI primitives ready

**No blockers identified.**
