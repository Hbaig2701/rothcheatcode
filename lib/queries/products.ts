"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CommunityProductRow,
  CustomProductRow,
  ProductListItem,
} from "@/lib/products/types";
import type {
  CreateCustomProductBody,
  UpdateCustomProductBody,
} from "@/lib/products/validators";

export const productsKeys = {
  all: ["products"] as const,
  list: () => [...productsKeys.all, "list"] as const,
  detail: (id: string) => [...productsKeys.all, "detail", id] as const,
};

export const communityProductsKeys = {
  all: ["community-products"] as const,
  list: () => [...communityProductsKeys.all, "list"] as const,
};

export interface ProductsListResponse {
  system: ProductListItem[];
  custom: ProductListItem[];
  growth: ProductListItem[];
  income: ProductListItem[];
  favorites: ProductListItem[];
  customDetailed: CustomProductRow[];
}

export function useProducts() {
  return useQuery({
    queryKey: productsKeys.list(),
    queryFn: async (): Promise<ProductsListResponse> => {
      const res = await fetch("/api/products");
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to fetch products" }));
        throw new Error(err.error || "Failed to fetch products");
      }
      return res.json();
    },
  });
}

export function useCustomProduct(id: string | null) {
  return useQuery({
    queryKey: productsKeys.detail(id ?? ""),
    queryFn: async (): Promise<CustomProductRow> => {
      const res = await fetch(`/api/products/${id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to fetch product" }));
        throw new Error(err.error || "Failed to fetch product");
      }
      return res.json();
    },
    enabled: !!id,
  });
}

/**
 * Format a 400 Validation-failed response from /api/products into a
 * human-readable multi-line error message. The API now returns
 * `issues: [{path, message}]` for every Zod validation failure (see
 * app/api/products/route.ts and app/api/products/[id]/route.ts). Without
 * this surfacing, advisors only saw the generic "Validation failed" toast
 * with no clue which field was wrong (Daniel F., ticket 07d8602d).
 */
function formatValidationError(
  err: { error?: string; issues?: Array<{ path: string; message: string }> },
  fallback: string
): string {
  if (Array.isArray(err.issues) && err.issues.length > 0) {
    const lines = err.issues.map((i) => {
      // Strip "config." prefix — it's noise. Show the leaf path.
      const path = i.path.replace(/^config\./, "");
      return path ? `• ${path}: ${i.message}` : `• ${i.message}`;
    });
    return `${err.error ?? fallback}\n${lines.join("\n")}`;
  }
  return err.error || fallback;
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateCustomProductBody): Promise<CustomProductRow> => {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to create product" }));
        throw new Error(formatValidationError(err, "Failed to create product"));
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productsKeys.all });
    },
  });
}

export function useUpdateProduct(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateCustomProductBody): Promise<CustomProductRow> => {
      const res = await fetch(`/api/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to update product" }));
        throw new Error(formatValidationError(err, "Failed to update product"));
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productsKeys.all });
      // Editing a product changes the engine output for any client that
      // references it. The server-side projection cache is keyed on the
      // product's updated_at and will recompute on the next request, but
      // the client-side React Query cache for projections/analysis must
      // also be cleared — otherwise advisors land on a stale dashboard.
      // We don't know which clients use this product without an extra
      // round-trip, so invalidate every projection/analysis query.
      qc.invalidateQueries({
        predicate: (q) => {
          const key = q.queryKey[0];
          return key === "projections" || key === "analysis";
        },
      });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, force }: { id: string; force?: boolean }) => {
      const url = force ? `/api/products/${id}?force=true` : `/api/products/${id}`;
      const res = await fetch(url, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 409 = in use → throw structured error
        if (res.status === 409) {
          const e = new Error(json.message || "Product in use");
          (e as Error & { code?: string; clientsUsingProduct?: number }).code = "in_use";
          (e as Error & { code?: string; clientsUsingProduct?: number }).clientsUsingProduct =
            json.clientsUsingProduct;
          throw e;
        }
        throw new Error(json.error || "Failed to delete product");
      }
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productsKeys.all });
      // Force-delete nulls out custom_product_id on every client that used
      // it (DB FK has ON DELETE SET NULL). Those clients' cached projections
      // and analyses no longer reflect what the engine will produce next,
      // so flush the client-side cache.
      qc.invalidateQueries({
        predicate: (q) => {
          const key = q.queryKey[0];
          return key === "projections" || key === "analysis" || key === "clients";
        },
      });
    },
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/products/${id}/favorite`, { method: "PATCH" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || "Failed to toggle favorite");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productsKeys.all });
    },
  });
}

// AI research
export interface ProductResearchInput {
  method: "search" | "document";
  query?: string;
  document?: { base64: string; name: string };
}

export interface ProductResearchResponse {
  product_found: boolean;
  carrier?: string;
  carrier_product_name?: string;
  suggested_generic_name?: string;
  archetype?: string;
  modifier_flags?: string[];
  category?: "growth" | "income";
  parameters?: Record<string, unknown>;
  sources?: Array<{ url: string; type: string }>;
  warnings?: Array<{ field: string; message: string; resolution: string }>;
  unsupported_features?: Array<{
    feature: string;
    description: string;
    approach: string;
    impact: string;
  }>;
  error?: string;
}

export function useResearchProduct() {
  return useMutation({
    mutationFn: async (input: ProductResearchInput): Promise<ProductResearchResponse> => {
      const res = await fetch("/api/products/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Research failed" }));
        throw new Error(err.error || "Research failed");
      }
      return res.json();
    },
  });
}

// ---------------------------------------------------------------------------
// Community Products — platform-curated catalog
// ---------------------------------------------------------------------------

export interface CommunityProductsResponse {
  products: CommunityProductRow[];
  growth: CommunityProductRow[];
  income: CommunityProductRow[];
}

export function useCommunityProducts() {
  return useQuery({
    queryKey: communityProductsKeys.list(),
    queryFn: async (): Promise<CommunityProductsResponse> => {
      const res = await fetch("/api/community-products");
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to fetch community products" }));
        throw new Error(err.error || "Failed to fetch community products");
      }
      return res.json();
    },
  });
}

/**
 * Adopt a Community product — copies it into the advisor's My Products.
 * On success the new product appears in the existing products list, so we
 * invalidate that cache. A 409 means the advisor already adopted it.
 */
export function useAdoptCommunityProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (communityProductId: string): Promise<CustomProductRow> => {
      const res = await fetch(`/api/community-products/${communityProductId}/adopt`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const e = new Error(json.error || "Failed to add product") as Error & { code?: string };
        if (json.code) e.code = json.code;
        throw e;
      }
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productsKeys.all });
    },
  });
}
