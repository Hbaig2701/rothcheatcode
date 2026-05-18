"use client";

import { useState, useEffect } from "react";
import { Columns3, RotateCcw } from "lucide-react";
import { ColumnSelectorModal } from "@/components/results/deep-dive/column-selector-modal";
import {
  loadUserDefaultColumnPreferences,
  saveUserDefaultColumnPreferences,
  clearUserDefaultColumnPreferences,
  getDefaultColumns,
} from "@/lib/table-columns/storage";
import { COLUMN_DEFINITIONS } from "@/lib/table-columns/column-definitions";

type ProductType = "growth" | "gi";

interface ProductCardProps {
  productType: ProductType;
  title: string;
  description: string;
}

function ProductCard({ productType, title, description }: ProductCardProps) {
  const [open, setOpen] = useState(false);
  const [columns, setColumns] = useState<string[] | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // localStorage is browser-only; defer the initial read to mount so the
  // server-rendered tree matches the client's first paint when no favourite
  // exists yet.
  useEffect(() => {
    const saved = loadUserDefaultColumnPreferences(productType);
    setColumns(saved?.selectedColumns ?? null);
    setSavedAt(saved?.lastUpdated ?? null);
  }, [productType]);

  const handleSave = (next: string[]) => {
    const prefs = {
      selectedColumns: next,
      // Widths are per-client (advisors size for the data they're looking
      // at), so the favourite captures order/visibility only.
      columnWidths: {},
      lastUpdated: new Date().toISOString(),
    };
    saveUserDefaultColumnPreferences(productType, prefs);
    setColumns(next);
    setSavedAt(prefs.lastUpdated);
    setOpen(false);
  };

  const handleReset = () => {
    clearUserDefaultColumnPreferences(productType);
    setColumns(null);
    setSavedAt(null);
  };

  // Pass either the saved favourite or the built-in preset into the picker,
  // so opening the modal for the first time shows what new clients currently
  // open with — not an empty list.
  const initialSelection = columns ?? getDefaultColumns(productType);

  // Count of non-frozen columns is what advisors care about (Year/Age are
  // always present anyway).
  const frozenIds = new Set(COLUMN_DEFINITIONS.filter((c) => c.frozen).map((c) => c.id));
  const visibleCount = initialSelection.filter((id) => !frozenIds.has(id)).length;

  const isCustomized = columns !== null;

  return (
    <div className="rounded-xl border border-border bg-bg-card p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Columns</div>
          <div className="text-lg font-semibold text-foreground">{visibleCount}</div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-border-default/50">
        <div className="text-xs text-muted-foreground">
          {isCustomized && savedAt
            ? `Favourite saved ${new Date(savedAt).toLocaleDateString()}`
            : "Using the built-in default"}
        </div>
        <div className="flex items-center gap-2">
          {isCustomized && (
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
              title="Clear the favourite — new clients will open with the built-in default again"
            >
              <RotateCcw className="size-3" />
              Reset
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-bg-input border border-border-default rounded-lg text-foreground hover:bg-white/5 transition-colors"
          >
            <Columns3 className="size-4" />
            {isCustomized ? "Edit favourite" : "Set favourite"}
          </button>
        </div>
      </div>

      <ColumnSelectorModal
        open={open}
        onClose={() => setOpen(false)}
        selectedColumns={initialSelection}
        onSave={handleSave}
        productType={productType}
      />
    </div>
  );
}

export function ColumnsTab() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-medium text-foreground">My Columns</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Set your favourite column layout for the year-by-year table. Every new client
          opens with your favourite by default. You can still tweak columns on an
          individual client without losing the favourite for everyone else.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl">
        <ProductCard
          productType="growth"
          title="Growth FIA reports"
          description="Used for Generic Growth, Vesting Bonus, Phased Bonus, and other Growth-mode reports."
        />
        <ProductCard
          productType="gi"
          title="Guaranteed Income reports"
          description="Used for Athene, American Equity, and other Income-rider reports."
        />
      </div>

      <p className="text-xs text-muted-foreground max-w-2xl">
        Per-client edits override your favourite. If you've already customized columns on a
        specific client, that client keeps its layout — setting a new favourite only changes
        what *new* clients open with.
      </p>
    </div>
  );
}
