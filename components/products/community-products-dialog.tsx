"use client";

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Package,
  Check,
  Plus,
  Users,
  AlertCircle,
} from "lucide-react";
import {
  useCommunityProducts,
  useAdoptCommunityProduct,
  useProducts,
} from "@/lib/queries/products";
import { ARCHETYPE_LABELS } from "@/lib/products/types";
import type { CommunityProductRow, ProductArchetype } from "@/lib/products/types";

interface CommunityProductsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type CategoryFilter = "all" | "growth" | "income";

export function CommunityProductsDialog({ open, onOpenChange }: CommunityProductsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 pr-8">
            <Users className="size-5 text-primary" />
            Community Products
          </DialogTitle>
          <DialogDescription>
            Ready-made products you can add to your own My Products list in one click.
            Each one becomes your own editable copy.
          </DialogDescription>
        </DialogHeader>
        <CommunityProductsBrowser />
      </DialogContent>
    </Dialog>
  );
}

/**
 * The catalog body (category filter + product list). Rendered both by the
 * standalone CommunityProductsDialog and as a step inside AddProductDialog,
 * so it carries no dialog chrome of its own.
 */
export function CommunityProductsBrowser() {
  const { data, isLoading, error } = useCommunityProducts();
  const { data: myProducts } = useProducts();
  const [filter, setFilter] = useState<CategoryFilter>("all");

  // community_product_id back-links on the advisor's own products tell us
  // which catalog items they've already adopted, so those rows show "Added"
  // from the start instead of letting them create a duplicate.
  const adoptedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of myProducts?.customDetailed ?? []) {
      if (p.community_product_id) ids.add(p.community_product_id);
    }
    return ids;
  }, [myProducts]);

  const products = data?.products ?? [];
  const filtered = filter === "all" ? products : products.filter((p) => p.category === filter);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      {/* Category filter */}
      {products.length > 0 && (
        <div className="flex items-center gap-2 pb-4">
          {(["all", "growth", "income"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`text-xs px-3 py-1.5 rounded-full border capitalize transition-colors ${
                filter === c
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:bg-accent/40"
              }`}
            >
              {c === "all" ? "All" : c}
            </button>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-300/40 bg-red-50/30 p-4 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-400 flex items-start gap-2">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <span>Failed to load community products: {error.message}</span>
        </div>
      )}

      {!isLoading && !error && products.length === 0 && (
        <div className="text-center py-16 space-y-3">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
            <Package className="size-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            No community products are available yet.
          </p>
        </div>
      )}

      {!isLoading && !error && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((product) => (
            <CommunityProductRow
              key={product.id}
              product={product}
              alreadyAdopted={adoptedIds.has(product.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CommunityProductRow({
  product,
  alreadyAdopted,
}: {
  product: CommunityProductRow;
  alreadyAdopted: boolean;
}) {
  const adopt = useAdoptCommunityProduct();
  const [justAdded, setJustAdded] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const added = alreadyAdopted || justAdded;
  const archetypeLabel =
    ARCHETYPE_LABELS[product.archetype as ProductArchetype] ?? product.archetype;

  const handleAdd = async () => {
    setErrMsg(null);
    try {
      await adopt.mutateAsync(product.id);
      setJustAdded(true);
    } catch (e) {
      const err = e as Error & { code?: string };
      // 409 = advisor already has a product with this name → treat as "added"
      if (err.code === "duplicate_name") {
        setJustAdded(true);
      } else {
        setErrMsg(err.message || "Failed to add product");
      }
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <Package className="size-4 text-muted-foreground shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{product.name}</span>
          <Badge
            variant={product.category === "growth" ? "default" : "secondary"}
            className="capitalize"
          >
            {product.category}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 truncate">
          {archetypeLabel}
          {product.carrier_product_name && (
            <span className="opacity-60"> · {product.carrier_product_name}</span>
          )}
        </div>
        {product.description && (
          <p className="text-xs text-muted-foreground/80 mt-1 line-clamp-2">
            {product.description}
          </p>
        )}
        {errMsg && (
          <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errMsg}</p>
        )}
      </div>

      <div className="shrink-0">
        {added ? (
          <Button variant="ghost" size="sm" disabled className="text-green-600 dark:text-green-500">
            <Check className="size-4" />
            Added
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={handleAdd} disabled={adopt.isPending}>
            {adopt.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Add to My Products
          </Button>
        )}
      </div>
    </div>
  );
}
