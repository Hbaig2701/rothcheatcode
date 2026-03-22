'use client';

/**
 * Column Selector Modal
 *
 * Allows users to customize which columns are visible in projection tables
 * - Grouped by category (Taxes, Income, Balances, etc.)
 * - Max 10 selectable columns (excluding frozen Year/Age)
 * - Frozen columns cannot be deselected
 * - Cancel/Apply buttons
 */

import { useState, useMemo, useEffect } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import {
  COLUMN_DEFINITIONS,
  type ColumnDefinition,
  type ColumnCategory,
} from '@/lib/table-columns/column-definitions';

interface ColumnSelectorModalProps {
  open: boolean;
  onClose: () => void;
  selectedColumns: string[];
  onSave: (columns: string[]) => void;
  productType: 'growth' | 'gi';
}

// Category display names (prettier than raw enum values)
const CATEGORY_LABELS: Record<ColumnCategory, string> = {
  core: 'Core (Always Visible)',
  balances: 'Account Balances',
  growth: 'Growth & Interest',
  distributions: 'Distributions',
  income: 'Income',
  taxes: 'Tax Calculations',
  irmaa: 'IRMAA (Medicare)',
  product: 'Product Details (Growth FIA)',
  'gi-income': 'Guaranteed Income',
};

export function ColumnSelectorModal({
  open,
  onClose,
  selectedColumns,
  onSave,
  productType,
}: ColumnSelectorModalProps) {
  const [tempSelection, setTempSelection] = useState<string[]>(selectedColumns);
  const [searchQuery, setSearchQuery] = useState('');

  // Reset temp selection and search when modal opens
  useEffect(() => {
    if (open) {
      setTempSelection(selectedColumns);
      setSearchQuery('');
    }
  }, [open, selectedColumns]);

  // Filter columns by product type
  const availableColumns = useMemo(
    () =>
      COLUMN_DEFINITIONS.filter(
        (col) =>
          col.visibleForProducts.includes(productType) ||
          col.visibleForProducts.includes('all')
      ),
    [productType]
  );

  // Filter by search query
  const filteredColumns = useMemo(() => {
    if (!searchQuery.trim()) return availableColumns;

    const query = searchQuery.toLowerCase();
    return availableColumns.filter(
      (col) =>
        col.label.toLowerCase().includes(query) ||
        col.description?.toLowerCase().includes(query)
    );
  }, [availableColumns, searchQuery]);

  // Group by category
  const groupedColumns = useMemo(() => {
    return filteredColumns.reduce((acc, col) => {
      if (!acc[col.category]) {
        acc[col.category] = [];
      }
      acc[col.category].push(col);
      return acc;
    }, {} as Record<ColumnCategory, ColumnDefinition[]>);
  }, [filteredColumns]);

  // Count non-frozen selected columns
  const nonFrozenSelectedCount = useMemo(() => {
    return tempSelection.filter((id) => {
      const col = COLUMN_DEFINITIONS.find((c) => c.id === id);
      return !col?.frozen;
    }).length;
  }, [tempSelection]);

  const handleToggle = (columnId: string, frozen?: boolean) => {
    if (frozen) return; // Cannot toggle frozen columns

    if (tempSelection.includes(columnId)) {
      // Deselect
      setTempSelection(tempSelection.filter((id) => id !== columnId));
    } else {
      // Select - check max limit
      if (nonFrozenSelectedCount >= 10) {
        alert('Maximum 10 columns can be selected (excluding frozen Year/Age columns)');
        return;
      }
      setTempSelection([...tempSelection, columnId]);
    }
  };

  const handleApply = () => {
    onSave(tempSelection);
    onClose();
  };

  const handleCancel = () => {
    setTempSelection(selectedColumns); // Reset to original
    onClose();
  };

  if (!open) return null;

  return (
    <Dialog.Root open={open} onOpenChange={(newOpen) => { if (!newOpen) handleCancel(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-[#1a1a1a] rounded-xl shadow-2xl border border-white/10 w-[650px] max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/10">
          <Dialog.Title className="text-xl font-semibold text-white">
            Adjust Columns
          </Dialog.Title>
          <p className="text-sm text-white/60 mt-1">
            Select up to 10 columns to display (Year and Age are always visible)
          </p>

          {/* Search Input */}
          <div className="mt-4">
            <input
              type="text"
              placeholder="Search columns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#d4af37] focus:border-transparent"
            />
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
          {Object.keys(groupedColumns).length === 0 ? (
            <div className="py-12 text-center text-sm text-white/50">
              No columns found matching "{searchQuery}"
            </div>
          ) : (
            <>
              {(Object.keys(groupedColumns) as ColumnCategory[]).map((category) => {
                const columns = groupedColumns[category];
                if (!columns || columns.length === 0) return null;

                return (
                  <div key={category} className="mb-6 last:mb-0">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-3">
                      {CATEGORY_LABELS[category]}
                    </h3>
                    <div className="space-y-2">
                      {columns.map((col) => {
                        const isSelected = tempSelection.includes(col.id);
                        const isDisabled = col.frozen;

                        return (
                          <label
                            key={col.id}
                            className={`
                              flex items-start gap-3 p-3 rounded-lg transition-colors
                              ${isDisabled
                                ? 'opacity-50 cursor-not-allowed bg-white/5'
                                : 'cursor-pointer hover:bg-white/5'
                              }
                            `}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggle(col.id, col.frozen)}
                              disabled={isDisabled}
                              className="mt-0.5 rounded border-white/20 bg-white/5 text-[#d4af37] focus:ring-[#d4af37] focus:ring-offset-0 disabled:cursor-not-allowed"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-white flex items-center gap-2">
                                {col.label}
                                {col.frozen && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60">
                                    FROZEN
                                  </span>
                                )}
                              </div>
                              {col.description && (
                                <div className="text-xs text-white/50 mt-0.5">
                                  {col.description}
                                </div>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between">
          <div className="text-sm text-white/60">
            <span className="font-medium text-white">{nonFrozenSelectedCount}</span> / 10 columns selected
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm border border-white/20 rounded-lg text-white hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-4 py-2 text-sm bg-[#d4af37] text-black rounded-lg hover:bg-[#c29d2f] transition-colors font-medium"
            >
              Apply
            </button>
          </div>
        </div>
      </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
