---
phase: 02
plan: 03
subsystem: client-management
tags: [tanstack-query, react-hooks, client-crud, cache-invalidation]

dependency-graph:
  requires:
    - phase: 02-01
      provides: TanStack Query infrastructure, Client types
  provides:
    - useClients hook for fetching all clients
    - useClient hook for fetching single client
    - useCreateClient mutation hook
    - useUpdateClient mutation hook
    - useDeleteClient mutation hook
    - clientKeys query key factory
  affects:
    - 02-04 (Client list page uses these hooks)
    - 02-05 (Client CRUD forms use these hooks)
    - 03-xx (Client data entry forms will use these hooks)

tech-stack:
  added: []
  patterns:
    - Query key factory pattern for cache management
    - TanStack Query v5 object syntax
    - Cache invalidation on mutations
    - Conditional queries with enabled option

key-files:
  created:
    - lib/queries/clients.ts
  modified: []

decisions:
  - id: query-key-factory
    description: "Used query key factory pattern for consistent caching"
    rationale: "Enables type-safe cache invalidation and query coordination"

metrics:
  duration: "1m"
  completed: "2026-01-18"
---

# Phase 02 Plan 03: TanStack Query Hooks for Client Operations Summary

**One-liner:** TanStack Query v5 hooks for all client CRUD operations with query key factory pattern and automatic cache invalidation.

## What Was Built

### 1. Query Key Factory (`clientKeys`)
```typescript
export const clientKeys = {
  all: ["clients"] as const,
  lists: () => [...clientKeys.all, "list"] as const,
  list: (filters?: string) => [...clientKeys.lists(), filters] as const,
  details: () => [...clientKeys.all, "detail"] as const,
  detail: (id: string) => [...clientKeys.details(), id] as const,
};
```
Provides consistent, hierarchical query keys for cache management.

### 2. Read Hooks
- **useClients()** - Fetches all clients for current user via `/api/clients`
- **useClient(id)** - Fetches single client via `/api/clients/{id}` with `enabled: !!id` guard

### 3. Mutation Hooks
- **useCreateClient()** - POST to `/api/clients`, invalidates list cache on success
- **useUpdateClient()** - PUT to `/api/clients/{id}`, invalidates both detail and list caches
- **useDeleteClient()** - DELETE to `/api/clients/{id}`, removes from cache and invalidates list

### Key Patterns

| Pattern | Implementation |
|---------|----------------|
| "use client" directive | Required for hooks using React Context |
| Error handling | Parse error response JSON, throw Error with message |
| Cache invalidation | `invalidateQueries` triggers refetch, `removeQueries` removes from cache |
| Conditional queries | `enabled: !!id` prevents query when id is falsy |
| TanStack Query v5 | Single object parameter syntax for useQuery/useMutation |

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Query key factory | Hierarchical key structure | Enables granular cache invalidation (invalidate all lists, specific detail, etc.) |
| Delete cache handling | removeQueries + invalidateQueries | Immediately remove deleted item, then refresh list |
| Update cache handling | Invalidate detail + list | Ensures both cached detail and list views are fresh |

## Commits

| Hash | Type | Description |
|------|------|-------------|
| f6a0932 | feat | TanStack Query hooks for client operations (committed with LogoutButton) |

Note: Task was already committed in prior execution alongside LogoutButton component.

## Files Created

| File | Purpose |
|------|---------|
| `lib/queries/clients.ts` | TanStack Query hooks for all client CRUD operations |

## Verification Passed

- [x] No type errors in lib/queries/clients.ts
- [x] 5 exported functions (useClients, useClient, useCreateClient, useUpdateClient, useDeleteClient)
- [x] 1 clientKeys export
- [x] Uses TanStack Query v5 object syntax
- [x] Has "use client" directive

## Next Phase Readiness

**Ready for 02-04 (Client List Page):**
- [x] useClients() hook ready for data fetching
- [x] useDeleteClient() hook ready for delete action
- [x] Query key factory in place for cache coordination

**Ready for 02-05 (Client Forms):**
- [x] useCreateClient() hook ready for create form
- [x] useUpdateClient() hook ready for edit form
- [x] useClient() hook ready for loading existing client data

**No blockers identified.**
