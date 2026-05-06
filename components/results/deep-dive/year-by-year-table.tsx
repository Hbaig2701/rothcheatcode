"use client";

import { useState, useMemo } from "react";
import type { YearlyResult } from "@/lib/calculations/types";
import type { NonSSIIncomeEntry } from "@/lib/types/client";
import { COLUMN_DEFINITIONS } from "@/lib/table-columns/column-definitions";
import { loadColumnPreferences, saveColumnPreferences, getDefaultColumns } from "@/lib/table-columns/storage";
import { ColumnSelectorModal } from "./column-selector-modal";
import { ResizableTable } from "./resizable-table";
import { Settings2 } from "lucide-react";

const INCOME_TYPE_TO_COLUMN: Record<string, string> = {
  pension: "incomePension",
  rental: "incomeRental",
  dividends: "incomeDividends",
  capital_gains: "incomeCapitalGains",
  wages: "incomeWages",
  annuity: "incomeAnnuity",
  other: "incomeOther",
};

interface YearByYearTableProps {
  years: YearlyResult[];
  scenario: "baseline" | "formula";
  productType?: "growth" | "gi";
  nonSsiIncome?: NonSSIIncomeEntry[];
  clientId?: string; // Per-client column preferences
  filingStatus?: string; // When non-married, the Spouse Age column is suppressed.
  /**
   * When widow analysis is on, the engine doesn't tag each year with a filing
   * status — but the report needs to surface the MFJ → Single switch in the
   * "Filing Status" column. We compute the per-year value at render time
   * using the death age + the row's age. Pass these through so the table can
   * inject the right value before the formatter runs.
   */
  widowAnalysis?: boolean;
  widowDeathAge?: number | null;
}

/**
 * Year-by-year projection table with adjustable columns
 * - Customizable column selection (up to 20 columns)
 * - Resizable column widths
 * - Frozen Year/Age columns
 * - Horizontal scroll
 * - Preferences saved to localStorage
 */
export function YearByYearTable({
  years,
  scenario,
  productType = "growth",
  nonSsiIncome,
  clientId,
  filingStatus,
  widowAnalysis = false,
  widowDeathAge = null,
}: YearByYearTableProps) {
  const [modalOpen, setModalOpen] = useState(false);

  // Storage key is per-client so each client keeps its own column preferences.
  // Falls back to a global key if no clientId is provided.
  const storageKey = clientId ? `year-by-year-${clientId}` : "year-by-year";

  // Inject per-type income breakdowns into each row so columns like
  // "Pension", "Rental Income", etc. can display values. This is computed
  // at the display layer — the engine doesn't track income by type.
  // Also injects a per-year filing status string when widow analysis is on,
  // so the "Filing Status" column shows the MFJ → Single switch at the
  // configured death age. Engine doesn't track filing status per year.
  const enrichedYears = useMemo(() => {
    // Build the per-year non-SSI income breakdown lookup.
    const byYear = new Map<number, Record<string, number>>();
    for (const entry of nonSsiIncome ?? []) {
      const colId = INCOME_TYPE_TO_COLUMN[entry.type ?? "other"] ?? "incomeOther";
      if (!colId) continue;
      const existing = byYear.get(entry.year) ?? {};
      existing[colId] = (existing[colId] ?? 0) + entry.gross_taxable;
      byYear.set(entry.year, existing);
    }

    // Map filing_status enum -> human label for the column.
    const filingStatusLabel = (() => {
      switch (filingStatus) {
        case "married_filing_jointly": return "MFJ";
        case "married_filing_separately": return "MFS";
        case "head_of_household": return "HoH";
        case "single": return "Single";
        default: return "—";
      }
    })();

    return years.map((y) => {
      const typeBreakdown = byYear.get(y.year);
      // Filing status: defaults to the client's status. When widow analysis
      // is on AND the row is at-or-after the configured death age, the
      // surviving spouse files single — same heuristic the engine uses.
      let perYearFilingStatus: string = filingStatusLabel;
      if (widowAnalysis && widowDeathAge != null && y.age >= widowDeathAge && filingStatusLabel === "MFJ") {
        perYearFilingStatus = "Single (Widow)";
      }
      const merged: YearlyResult & Record<string, unknown> = {
        ...y,
        ...(typeBreakdown ?? {}),
        filingStatus: perYearFilingStatus,
      };
      return merged;
    });
  }, [years, nonSsiIncome, filingStatus, widowAnalysis, widowDeathAge]);

  // Load column preferences from localStorage (or use defaults).
  // Key includes clientId so each client keeps its own column selection.
  const [selectedColumns, setSelectedColumns] = useState<string[]>(() => {
    const saved = loadColumnPreferences(storageKey);
    return saved?.selectedColumns || getDefaultColumns(productType);
  });

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const saved = loadColumnPreferences(storageKey);
    return saved?.columnWidths || {};
  });

  // Build active columns in the user-chosen order.
  // Frozen columns (Year/Age/Spouse Age) are forced to the front — CSS-sticky positioning
  // assumes they occupy the leftmost slots. Everything else honors the order the user
  // set in the column selector modal.
  // When the client isn't married, suppress the Spouse Age column — even if a
  // prior preference saved to localStorage had it toggled on. Otherwise the
  // frozen column renders forever as "—" for single/HoH clients.
  const isMarried = filingStatus === "married_filing_jointly" || filingStatus === "married_filing_separately";
  const activeColumns = (() => {
    const defMap = new Map(COLUMN_DEFINITIONS.map((c) => [c.id, c]));
    const resolved = selectedColumns
      .filter((id) => isMarried || id !== "spouseAge")
      .map((id) => defMap.get(id))
      .filter(Boolean) as typeof COLUMN_DEFINITIONS;
    const frozen = resolved.filter((c) => c.frozen);
    const nonFrozen = resolved.filter((c) => !c.frozen);
    return [...frozen, ...nonFrozen];
  })();

  const frozenColumnCount = activeColumns.filter((c) => c.frozen).length;

  const handleSaveColumns = (columns: string[]) => {
    setSelectedColumns(columns);
    saveColumnPreferences(storageKey, {
      selectedColumns: columns,
      columnWidths,
      lastUpdated: new Date().toISOString(),
    });
  };

  const handleWidthChange = (columnId: string, width: number) => {
    const newWidths = { ...columnWidths, [columnId]: width };
    setColumnWidths(newWidths);
    saveColumnPreferences(storageKey, {
      selectedColumns,
      columnWidths: newWidths,
      lastUpdated: new Date().toISOString(),
    });
  };

  return (
    <div className="space-y-4">
      {/* Header with Adjust Columns button */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">
          {scenario === "baseline" ? "Baseline" : "Strategy"} Projection
        </h3>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-bg-card border border-border-default rounded-lg text-foreground hover:bg-white/10 transition-colors"
        >
          <Settings2 className="h-4 w-4" />
          Adjust Columns
        </button>
      </div>

      {/* Resizable table */}
      <ResizableTable
        columns={activeColumns}
        data={enrichedYears}
        columnWidths={columnWidths}
        onColumnWidthChange={handleWidthChange}
        frozenColumnCount={frozenColumnCount}
      />

      {/* Column selector modal */}
      <ColumnSelectorModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        selectedColumns={selectedColumns}
        onSave={handleSaveColumns}
        productType={productType}
      />
    </div>
  );
}
