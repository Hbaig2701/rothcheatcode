# Phase 02: Client Management (CRUD) - Research

**Researched:** 2026-01-18
**Domain:** Next.js 15 API routes, Supabase, TanStack Query, Data Tables
**Confidence:** HIGH

## Summary

This phase implements CRUD operations for client management using Next.js 15 App Router route handlers, Supabase with Row-Level Security, TanStack Query v5 for client-side state management, and shadcn/ui data tables built on TanStack Table.

The standard approach is:
1. **API Layer**: Next.js 15 route handlers (`app/api/clients/route.ts`) using Web Request/Response APIs with Zod validation
2. **Database Layer**: Supabase server client with generated TypeScript types and RLS enforcement
3. **Client State**: TanStack Query v5 for caching, mutations, and cache invalidation
4. **UI Layer**: shadcn/ui data table with TanStack Table for sorting, filtering, pagination

**Primary recommendation:** Use route handlers for API endpoints, TanStack Query for all data fetching/mutations in client components, and rely on Supabase RLS (not application code) for authorization.

## Standard Stack

The established libraries/tools for this domain:

### Core (Must Install)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tanstack/react-query` | ^5.x | Server state management | Industry standard for React data fetching, caching, mutations |
| `@tanstack/react-query-devtools` | ^5.x | Query debugging | Essential for development |
| `@tanstack/react-table` | ^8.x | Headless table logic | Powers shadcn/ui data-table, industry standard |
| `react-hook-form` | ^7.x | Form state management | Performant, minimal re-renders |
| `@hookform/resolvers` | ^3.x | Zod integration | Connects Zod schemas to react-hook-form |
| `zod` | ^3.x | Schema validation | Type-safe validation, TypeScript inference |

### Already Installed
| Library | Version | Purpose |
|---------|---------|---------|
| `@supabase/ssr` | ^0.8.0 | Server-side Supabase client |
| `@supabase/supabase-js` | ^2.90.1 | Supabase client library |
| `next` | 16.1.3 | Framework (App Router) |
| `shadcn` | ^3.7.0 | UI component system |

### Supporting (Optional)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `nuqs` | ^2.x | URL state management | When filter/sort state needs to persist in URL |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TanStack Query | SWR | TanStack has better mutation support and devtools |
| react-hook-form | Formik | RHF is more performant, less re-renders |
| Route Handlers | Server Actions | Route handlers better for REST API patterns; Server Actions for form submissions |

**Installation:**
```bash
npm install @tanstack/react-query @tanstack/react-query-devtools @tanstack/react-table react-hook-form @hookform/resolvers zod
```

## Architecture Patterns

### Recommended Project Structure
```
app/
├── api/
│   └── clients/
│       ├── route.ts           # GET (list), POST (create)
│       └── [id]/
│           └── route.ts       # GET (detail), PUT (update), DELETE
├── (dashboard)/
│   └── clients/
│       ├── page.tsx           # Clients list page (Server Component)
│       ├── new/
│       │   └── page.tsx       # Create client page
│       └── [id]/
│           ├── page.tsx       # Client detail page
│           └── edit/
│               └── page.tsx   # Edit client page
lib/
├── supabase/
│   ├── client.ts              # Browser client (exists)
│   ├── server.ts              # Server client (exists)
│   └── middleware.ts          # Auth middleware (exists)
├── queries/
│   └── clients.ts             # TanStack Query hooks
├── validations/
│   └── client.ts              # Zod schemas
└── types/
    └── database.types.ts      # Supabase generated types
components/
├── clients/
│   ├── client-table.tsx       # Data table component
│   ├── client-columns.tsx     # Column definitions
│   ├── client-form.tsx        # Create/Edit form
│   └── client-empty-state.tsx # No clients UI
└── providers/
    └── query-provider.tsx     # TanStack Query provider
```

### Pattern 1: Route Handler with Supabase Auth
**What:** API route handler that validates auth and uses typed Supabase client
**When to use:** All API endpoints that need authenticated access
**Example:**
```typescript
// app/api/clients/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { clientCreateSchema } from "@/lib/validations/client";

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  // CRITICAL: Use getUser() not getSession() for server-side auth verification
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // RLS automatically filters to user's clients only
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  // Validate with Zod
  const parsed = clientCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("clients")
    .insert({ ...parsed.data, user_id: user.id })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
```

### Pattern 2: TanStack Query Provider Setup
**What:** QueryClientProvider wrapper for Next.js App Router
**When to use:** Root layout to enable React Query throughout app
**Example:**
```typescript
// components/providers/query-provider.tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // Create QueryClient inside useState to avoid sharing between requests
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

### Pattern 3: TanStack Query Hooks for CRUD
**What:** Custom hooks wrapping useQuery and useMutation for client operations
**When to use:** All data fetching and mutations in client components
**Example:**
```typescript
// lib/queries/clients.ts
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Database } from "@/lib/types/database.types";

type Client = Database["public"]["Tables"]["clients"]["Row"];
type ClientInsert = Database["public"]["Tables"]["clients"]["Insert"];
type ClientUpdate = Database["public"]["Tables"]["clients"]["Update"];

// Query keys factory
export const clientKeys = {
  all: ["clients"] as const,
  lists: () => [...clientKeys.all, "list"] as const,
  list: (filters: string) => [...clientKeys.lists(), { filters }] as const,
  details: () => [...clientKeys.all, "detail"] as const,
  detail: (id: string) => [...clientKeys.details(), id] as const,
};

// Fetch all clients
export function useClients() {
  return useQuery({
    queryKey: clientKeys.lists(),
    queryFn: async (): Promise<Client[]> => {
      const res = await fetch("/api/clients");
      if (!res.ok) {
        throw new Error("Failed to fetch clients");
      }
      return res.json();
    },
  });
}

// Fetch single client
export function useClient(id: string) {
  return useQuery({
    queryKey: clientKeys.detail(id),
    queryFn: async (): Promise<Client> => {
      const res = await fetch(`/api/clients/${id}`);
      if (!res.ok) {
        throw new Error("Failed to fetch client");
      }
      return res.json();
    },
    enabled: !!id,
  });
}

// Create client mutation
export function useCreateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ClientInsert): Promise<Client> => {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create client");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
    },
  });
}

// Update client mutation
export function useUpdateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ClientUpdate }): Promise<Client> => {
      const res = await fetch(`/api/clients/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update client");
      }
      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: clientKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
    },
  });
}

// Delete client mutation
export function useDeleteClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/clients/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete client");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
    },
  });
}
```

### Pattern 4: shadcn/ui Data Table with TanStack Table
**What:** Reusable data table component with sorting, filtering, pagination
**When to use:** Displaying lists of records with interactive features
**Example:**
```typescript
// components/clients/client-columns.tsx
"use client";

import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Database } from "@/lib/types/database.types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

export const columns: ColumnDef<Client>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Name
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
  },
  {
    accessorKey: "state",
    header: "State",
  },
  {
    accessorKey: "filing_status",
    header: "Filing Status",
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) => {
      const date = new Date(row.getValue("created_at"));
      return date.toLocaleDateString();
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const client = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(client.id)}>
              Copy ID
            </DropdownMenuItem>
            <DropdownMenuItem>View details</DropdownMenuItem>
            <DropdownMenuItem>Edit</DropdownMenuItem>
            <DropdownMenuItem className="text-red-600">Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
```

### Pattern 5: Zod Schema with Type Inference
**What:** Shared validation schemas for client-side and server-side validation
**When to use:** Any form input or API request body
**Example:**
```typescript
// lib/validations/client.ts
import { z } from "zod";

export const clientCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  state: z.string().length(2, "Use 2-letter state code"),
  filing_status: z.enum(["single", "married_filing_jointly", "married_filing_separately", "head_of_household"]),
  // Add more fields as needed
});

export const clientUpdateSchema = clientCreateSchema.partial();

// Infer types from schemas
export type ClientCreateInput = z.infer<typeof clientCreateSchema>;
export type ClientUpdateInput = z.infer<typeof clientUpdateSchema>;
```

### Anti-Patterns to Avoid
- **Calling Route Handlers from Server Components:** Don't fetch from your own API in Server Components. Call Supabase directly instead.
- **Using getSession() for auth verification:** Always use `supabase.auth.getUser()` in server code - it validates the JWT with Supabase.
- **Mapping TanStack Query data to Redux/Context:** Don't duplicate state. TanStack Query IS your cache.
- **Defining data/columns inside component render:** Use `useMemo` for columns, `useState` for data to prevent infinite re-renders.
- **Manual refetch() calls everywhere:** Use `invalidateQueries()` after mutations instead.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Table sorting/filtering | Custom sort functions | TanStack Table | Handles edge cases, accessibility, performance |
| Form validation | Custom validation loops | react-hook-form + Zod | Type-safe, performant, error handling built-in |
| Data caching | localStorage/Context/Redux | TanStack Query | Automatic refetching, cache invalidation, devtools |
| Pagination | Manual offset/limit | TanStack Table pagination | Integrates with sorting/filtering, handles edge cases |
| Loading states | Custom isLoading flags | TanStack Query states | `isLoading`, `isFetching`, `isPending` all handled |
| Optimistic updates | Manual UI state management | TanStack Query mutations | Built-in rollback on error |
| Auth token refresh | Custom refresh logic | Supabase middleware | Already implemented in existing middleware.ts |

**Key insight:** CRUD operations seem simple but have many edge cases (concurrent updates, optimistic UI, error recovery, cache consistency). The standard stack handles these automatically.

## Common Pitfalls

### Pitfall 1: Using getSession() Instead of getUser() on Server
**What goes wrong:** JWT is not validated, security vulnerability
**Why it happens:** getSession() is faster but trusts the client-provided JWT
**How to avoid:** Always use `supabase.auth.getUser()` in Route Handlers and Server Components
**Warning signs:** Auth working inconsistently, security audit failures

### Pitfall 2: RLS Enabled Without Policies
**What goes wrong:** All queries return empty results, no errors
**Why it happens:** RLS defaults to "deny all" when enabled without policies
**How to avoid:** Create SELECT, INSERT, UPDATE, DELETE policies immediately after enabling RLS
**Warning signs:** Empty data responses with no error messages

### Pitfall 3: Views Bypassing RLS
**What goes wrong:** Data accessible to all users regardless of RLS
**Why it happens:** Views created with `postgres` user have `security definer` by default
**How to avoid:** Use `security_invoker = true` on views (Postgres 15+)
**Warning signs:** Users seeing other users' data through views

### Pitfall 4: TanStack Query Data Duplication
**What goes wrong:** Stale data, race conditions, inconsistent UI
**Why it happens:** Copying TanStack Query data to Redux/Context
**How to avoid:** Use TanStack Query as single source of truth for server state
**Warning signs:** Multiple sources of the same data, manual cache updates

### Pitfall 5: Infinite Re-renders in Data Table
**What goes wrong:** Browser hangs, memory issues
**Why it happens:** Column definitions or data arrays recreated on every render
**How to avoid:** Define columns outside component or use `useMemo`; use `useState` for data
**Warning signs:** React devtools showing constant re-renders

### Pitfall 6: Route Handler Caching Surprises
**What goes wrong:** Stale data returned from GET endpoints
**Why it happens:** Next.js caches GET route handlers by default in production
**How to avoid:** Add `export const dynamic = 'force-dynamic'` or use cookies()/headers()
**Warning signs:** Data not updating after mutations in production

### Pitfall 7: CORS Errors on API Routes
**What goes wrong:** Cross-origin requests blocked
**Why it happens:** Route handlers are same-origin only by default
**How to avoid:** Not usually an issue for same-domain apps; if needed, add CORS headers manually
**Warning signs:** Browser console showing CORS errors

### Pitfall 8: Service Role Key in Client Code
**What goes wrong:** Complete database access bypassing RLS
**Why it happens:** Accidentally using service_role key instead of anon key
**How to avoid:** Only use `NEXT_PUBLIC_SUPABASE_ANON_KEY` in client code
**Warning signs:** Users can access all data regardless of ownership

## Code Examples

### Complete Route Handler with Error Handling
```typescript
// app/api/clients/[id]/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { clientUpdateSchema } from "@/lib/validations/client";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = clientUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("clients")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("clients")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
```

### Client Form with React Hook Form + Zod
```typescript
// components/clients/client-form.tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { clientCreateSchema, type ClientCreateInput } from "@/lib/validations/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateClient } from "@/lib/queries/clients";

export function ClientForm({ onSuccess }: { onSuccess?: () => void }) {
  const createClient = useCreateClient();

  const form = useForm<ClientCreateInput>({
    resolver: zodResolver(clientCreateSchema),
    defaultValues: {
      name: "",
      date_of_birth: "",
      state: "",
      filing_status: "single",
    },
  });

  const onSubmit = async (data: ClientCreateInput) => {
    try {
      await createClient.mutateAsync(data);
      form.reset();
      onSuccess?.();
    } catch (error) {
      // Error is handled by mutation
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <Input
          placeholder="Client name"
          {...form.register("name")}
        />
        {form.formState.errors.name && (
          <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
        )}
      </div>

      <div>
        <Input
          type="date"
          {...form.register("date_of_birth")}
        />
        {form.formState.errors.date_of_birth && (
          <p className="text-sm text-red-500">{form.formState.errors.date_of_birth.message}</p>
        )}
      </div>

      <div>
        <Input
          placeholder="State (e.g., CA)"
          maxLength={2}
          {...form.register("state")}
        />
        {form.formState.errors.state && (
          <p className="text-sm text-red-500">{form.formState.errors.state.message}</p>
        )}
      </div>

      <div>
        <Select
          value={form.watch("filing_status")}
          onValueChange={(value) => form.setValue("filing_status", value as ClientCreateInput["filing_status"])}
        >
          <SelectTrigger>
            <SelectValue placeholder="Filing status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="single">Single</SelectItem>
            <SelectItem value="married_filing_jointly">Married Filing Jointly</SelectItem>
            <SelectItem value="married_filing_separately">Married Filing Separately</SelectItem>
            <SelectItem value="head_of_household">Head of Household</SelectItem>
          </SelectContent>
        </Select>
        {form.formState.errors.filing_status && (
          <p className="text-sm text-red-500">{form.formState.errors.filing_status.message}</p>
        )}
      </div>

      <Button type="submit" disabled={createClient.isPending}>
        {createClient.isPending ? "Creating..." : "Create Client"}
      </Button>

      {createClient.isError && (
        <p className="text-sm text-red-500">{createClient.error.message}</p>
      )}
    </form>
  );
}
```

### Data Table with Search/Filter
```typescript
// components/clients/client-table.tsx
"use client";

import { useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  type SortingState,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import { columns } from "./client-columns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Database } from "@/lib/types/database.types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

interface ClientTableProps {
  data: Client[];
}

export function ClientTable({ data }: ClientTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    state: {
      sorting,
      columnFilters,
    },
  });

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search clients..."
        value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
        onChange={(event) =>
          table.getColumn("name")?.setFilterValue(event.target.value)
        }
        className="max-w-sm"
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No clients found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end space-x-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
```

### Generate Supabase Types
```bash
# Generate TypeScript types from Supabase
npx supabase gen types typescript --project-id "your-project-id" > lib/types/database.types.ts

# Or from local development
npx supabase gen types typescript --local > lib/types/database.types.ts
```

### Using Generated Types with Supabase Client
```typescript
// lib/supabase/server.ts (updated)
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/types/database.types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component context
          }
        },
      },
    }
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| API Routes (pages/api) | Route Handlers (app/api) | Next.js 13+ | Use Web Request/Response APIs |
| getSession() | getUser() | Supabase recommendation | Critical security: validates JWT server-side |
| React Query v4 syntax | TanStack Query v5 object syntax | 2023 | Single object param: `useQuery({ queryKey, queryFn })` |
| @tanstack/react-table v7 | @tanstack/react-table v8 | 2022 | Fully headless, better TypeScript |
| useEffect for data | TanStack Query | Current best practice | Automatic caching, deduplication, background refresh |

**Deprecated/outdated:**
- `@supabase/auth-helpers-nextjs`: Replaced by `@supabase/ssr`
- `getSession()` for server auth: Use `getUser()` instead
- React Query v4 overloaded syntax: Use v5 object syntax

## Open Questions

Things that couldn't be fully resolved:

1. **Next.js 16.1.3 specific changes**
   - What we know: Project uses Next.js 16.1.3 which is very new
   - What's unclear: Any breaking changes from 15.x patterns
   - Recommendation: Patterns documented work with 15.x; monitor for 16.x specific issues

2. **shadcn/ui Table vs Data Table**
   - What we know: shadcn provides both basic Table and Data Table guide
   - What's unclear: Whether to use new Table from shadcn or build custom data-table
   - Recommendation: Use the Data Table pattern from shadcn docs with TanStack Table

## Sources

### Primary (HIGH confidence)
- [Next.js Route Handlers Docs](https://nextjs.org/docs/app/getting-started/route-handlers) - Official route handler patterns
- [Supabase Next.js Auth Setup](https://supabase.com/docs/guides/auth/server-side/nextjs) - Server-side auth patterns
- [shadcn/ui Data Table](https://ui.shadcn.com/docs/components/data-table) - Table component guide
- [shadcn/ui React Hook Form](https://ui.shadcn.com/docs/forms/react-hook-form) - Form integration patterns
- [Supabase TypeScript Types](https://supabase.com/docs/guides/api/rest/generating-types) - Type generation guide

### Secondary (MEDIUM confidence)
- [TanStack Query Next.js Integration Guide](https://www.storieasy.com/blog/integrate-tanstack-query-with-next-js-app-router-2025-ultimate-guide) - Setup patterns verified against official docs
- [Vercel Common App Router Mistakes](https://vercel.com/blog/common-mistakes-with-the-next-js-app-router-and-how-to-fix-them) - Pitfalls documented
- [TanStack Query Optimistic Updates](https://tanstack.com/query/v5/docs/framework/react/guides/optimistic-updates) - Mutation patterns

### Tertiary (LOW confidence)
- [RLS Performance Best Practices](https://prosperasoft.com/blog/database/supabase/supabase-rls-issues/) - Community blog, verify with official docs
- [TanStack Query Anti-patterns](https://www.buncolak.com/posts/avoiding-common-mistakes-with-tanstack-query-part-1/) - Community patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries are industry standard with official documentation
- Architecture: HIGH - Patterns verified against Next.js and library official docs
- Pitfalls: HIGH - Multiple sources confirm these issues

**Research date:** 2026-01-18
**Valid until:** 2026-02-18 (30 days - stack is stable)
