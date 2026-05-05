"use client";

import { useState } from "react";
import { useProducts, useToggleFavorite, useDeleteProduct } from "@/lib/queries/products";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  Plus,
  Star,
  Pencil,
  Trash2,
  Sparkles,
  Package,
} from "lucide-react";
import { ARCHETYPE_LABELS } from "@/lib/products/types";
import type { CustomProductRow, ProductArchetype } from "@/lib/products/types";
import { AddProductDialog } from "@/components/products/add-product-dialog";
import { EditProductSheet } from "@/components/products/edit-product-sheet";

export function ProductsTab() {
  const { data, isLoading, error } = useProducts();
  const toggleFav = useToggleFavorite();
  const deleteMut = useDeleteProduct();

  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string; inUse?: number } | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-300/40 bg-red-50/30 p-4 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-400">
        Failed to load products: {error.message}
      </div>
    );
  }

  const products = data?.customDetailed ?? [];

  const handleDelete = async (force = false) => {
    if (!confirmDelete) return;
    try {
      await deleteMut.mutateAsync({ id: confirmDelete.id, force });
      setConfirmDelete(null);
    } catch (err) {
      const e = err as Error & { code?: string; clientsUsingProduct?: number };
      if (e.code === "in_use") {
        setConfirmDelete({
          ...confirmDelete,
          inUse: e.clientsUsingProduct,
        });
      } else {
        alert(`Delete failed: ${e.message}`);
      }
    }
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-medium">My Products</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Custom product presets for use in client illustrations. AI-built or manually entered.
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="size-4" />
            Add Product
          </Button>
        </div>

        {/* Empty state */}
        {products.length === 0 && (
          <Card>
            <CardHeader className="text-center pt-12 pb-6">
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
                <Sparkles className="size-6 text-primary" />
              </div>
              <CardTitle>No custom products yet</CardTitle>
              <CardDescription className="max-w-md mx-auto">
                Add your own carrier products in seconds. Just type the product name
                and our AI will research and configure it for you.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center pb-12">
              <Button onClick={() => setAddOpen(true)} size="lg">
                <Plus className="size-4" />
                Add your first product
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Product list */}
        {products.length > 0 && (
          <div className="space-y-2">
            {products.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                onToggleFav={() => toggleFav.mutate(product.id)}
                onEdit={() => setEditId(product.id)}
                onDelete={() => setConfirmDelete({ id: product.id, name: product.name })}
              />
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground/70 leading-relaxed pt-4">
          Custom products work alongside built-in presets. They appear in the product picker
          when creating or editing a client. Sources used for AI research are stored privately
          and never displayed to clients.
        </p>
      </div>

      <AddProductDialog open={addOpen} onOpenChange={setAddOpen} />
      <EditProductSheet productId={editId} onClose={() => setEditId(null)} />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{confirmDelete?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.inUse
                ? `${confirmDelete.inUse} client${confirmDelete.inUse === 1 ? "" : "s"} use this product. Deleting will not break their projections (the underlying engine preset is preserved), but you'll lose the custom config.`
                : "This product will be permanently removed. You can always add it back later."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDelete(!!confirmDelete?.inUse)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMut.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              {confirmDelete?.inUse ? "Delete anyway" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ProductRow({
  product,
  onToggleFav,
  onEdit,
  onDelete,
}: {
  product: CustomProductRow;
  onToggleFav: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const archetypeLabel = ARCHETYPE_LABELS[product.archetype as ProductArchetype] ?? product.archetype;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 hover:bg-accent/30 transition-colors">
      <button
        onClick={onToggleFav}
        className="shrink-0 text-muted-foreground hover:text-yellow-500 transition-colors"
        aria-label={product.is_favorite ? "Unfavorite" : "Favorite"}
      >
        <Star
          className={`size-5 ${product.is_favorite ? "fill-yellow-500 text-yellow-500" : ""}`}
        />
      </button>

      <Package className="size-4 text-muted-foreground shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{product.name}</span>
          <Badge variant={product.category === "growth" ? "default" : "secondary"} className="capitalize">
            {product.category}
          </Badge>
          {product.source !== "manual" && (
            <Badge variant="outline" className="gap-1 text-xs">
              <Sparkles className="size-3" />
              AI
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 truncate">
          {archetypeLabel}
          {product.carrier_product_name && (
            <span className="opacity-60"> · {product.carrier_product_name}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit">
          <Pencil className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Delete">
          <Trash2 className="size-4 text-muted-foreground hover:text-red-600" />
        </Button>
      </div>
    </div>
  );
}
