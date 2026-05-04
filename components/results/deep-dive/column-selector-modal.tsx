'use client';

/**
 * Column Selector Modal
 *
 * Allows users to customize which columns are visible in projection tables.
 * - Top section: "Selected Columns" — the user's current selection in display order.
 *   Non-frozen items can be dragged to reorder, or unchecked to move back to the pool.
 * - Bottom section: "Available Columns" — the unselected pool grouped by category.
 *   Click to add to the end of the selected list.
 * - Frozen columns (Year, Age) are always present and cannot be unchecked or dragged.
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
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

const MAX_NON_FROZEN = 20;

export function ColumnSelectorModal({
  open,
  onClose,
  selectedColumns,
  onSave,
  productType,
}: ColumnSelectorModalProps) {
  const [tempSelection, setTempSelection] = useState<string[]>(selectedColumns);
  const [searchQuery, setSearchQuery] = useState('');
  // Ref for synchronous read in onDragOver/onDrop (state updates lag a render).
  // State copy is for visual styling only.
  const draggedIdRef = useRef<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTempSelection(selectedColumns);
      setSearchQuery('');
      draggedIdRef.current = null;
      setDraggedId(null);
      setDragOverId(null);
    }
  }, [open, selectedColumns]);

  const columnMap = useMemo(() => {
    const map = new Map<string, ColumnDefinition>();
    COLUMN_DEFINITIONS.forEach((c) => map.set(c.id, c));
    return map;
  }, []);

  const availableColumns = useMemo(
    () =>
      COLUMN_DEFINITIONS.filter(
        (col) =>
          col.visibleForProducts.includes(productType) ||
          col.visibleForProducts.includes('all')
      ),
    [productType]
  );

  const matchesSearch = (col: ColumnDefinition, query: string) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      col.label.toLowerCase().includes(q) ||
      !!col.description?.toLowerCase().includes(q)
    );
  };

  // Selected columns in the user-chosen order. Frozen first so they render at the top.
  const selectedOrdered = useMemo(() => {
    const resolved = tempSelection
      .map((id) => columnMap.get(id))
      .filter((c): c is ColumnDefinition => Boolean(c));
    const frozen = resolved.filter((c) => c.frozen);
    const nonFrozen = resolved.filter((c) => !c.frozen);
    return [...frozen, ...nonFrozen];
  }, [tempSelection, columnMap]);

  const selectedFiltered = useMemo(
    () => selectedOrdered.filter((c) => matchesSearch(c, searchQuery)),
    [selectedOrdered, searchQuery]
  );

  // Unselected pool (grouped)
  const unselectedGrouped = useMemo(() => {
    const result: Record<string, ColumnDefinition[]> = {};
    for (const col of availableColumns) {
      if (tempSelection.includes(col.id)) continue;
      if (!matchesSearch(col, searchQuery)) continue;
      if (!result[col.category]) result[col.category] = [];
      result[col.category].push(col);
    }
    return result as Record<ColumnCategory, ColumnDefinition[]>;
  }, [availableColumns, tempSelection, searchQuery]);

  const nonFrozenSelectedCount = useMemo(
    () => tempSelection.filter((id) => !columnMap.get(id)?.frozen).length,
    [tempSelection, columnMap]
  );

  const handleAdd = (id: string) => {
    if (tempSelection.includes(id)) return;
    const col = columnMap.get(id);
    if (!col) return;
    if (!col.frozen && nonFrozenSelectedCount >= MAX_NON_FROZEN) {
      alert(`Maximum ${MAX_NON_FROZEN} columns can be selected (excluding frozen Year/Age columns)`);
      return;
    }
    setTempSelection([...tempSelection, id]);
  };

  const handleRemove = (id: string) => {
    const col = columnMap.get(id);
    if (col?.frozen) return;
    setTempSelection(tempSelection.filter((x) => x !== id));
  };

  // Move a non-frozen row up or down by one position, working in the DISPLAYED order
  // (frozen first, then non-frozen). Frozen rows cannot move and act as a hard upper boundary.
  const moveBy = (id: string, delta: -1 | 1) => {
    const displayedIds = selectedOrdered.map((c) => c.id);
    const idx = displayedIds.indexOf(id);
    if (idx === -1) return;
    const targetIdx = idx + delta;
    if (targetIdx < 0 || targetIdx >= displayedIds.length) return;
    // Don't swap with a frozen column
    const targetCol = columnMap.get(displayedIds[targetIdx]);
    if (targetCol?.frozen) return;
    const next = [...displayedIds];
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    setTempSelection(next);
  };

  // ---- Drag handlers (HTML5 native) ----
  // CRITICAL: react state updates lag — read drag state from a ref for synchronous access.
  // Always call e.preventDefault() in onDragOver when a drag is in progress, otherwise the
  // browser disallows the drop and the whole interaction silently fails.

  const handleDragStart = (e: React.DragEvent, id: string) => {
    const col = columnMap.get(id);
    if (col?.frozen) {
      e.preventDefault();
      return;
    }
    draggedIdRef.current = id;
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    // Firefox requires setData for drag to start
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    const dragged = draggedIdRef.current;
    if (!dragged) return;
    const targetCol = columnMap.get(targetId);
    if (targetCol?.frozen) return; // Cannot drop onto frozen row
    // Must preventDefault to allow drop — do this BEFORE any other early returns
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragged !== targetId && dragOverId !== targetId) setDragOverId(targetId);
  };

  const handleDragLeave = (targetId: string) => {
    if (dragOverId === targetId) setDragOverId(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const src = draggedIdRef.current;
    draggedIdRef.current = null;
    setDraggedId(null);
    setDragOverId(null);
    if (!src || src === targetId) return;

    const targetCol = columnMap.get(targetId);
    const srcCol = columnMap.get(src);
    if (targetCol?.frozen || srcCol?.frozen) return;

    // Reorder using the DISPLAYED order (selectedOrdered) — frozen are pulled to the
    // top, so dropping must operate on what the user actually sees. Without this, the
    // drop targets the wrong slot when frozen items aren't already at the start of
    // tempSelection.
    const displayedIds = selectedOrdered.map((c) => c.id);
    const sourceIndex = displayedIds.indexOf(src);
    const targetIndex = displayedIds.indexOf(targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const next = [...displayedIds];
    next.splice(sourceIndex, 1);
    // Use targetIndex (NOT targetIndex - 1) so the dragged item takes the target's spot
    // and the target shifts away. Avoids the "adjacent drag is a no-op" bug.
    next.splice(targetIndex, 0, src);
    setTempSelection(next);
  };

  const handleDragEnd = () => {
    draggedIdRef.current = null;
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleApply = () => {
    onSave(tempSelection);
    onClose();
  };

  const handleCancel = () => {
    setTempSelection(selectedColumns);
    onClose();
  };

  if (!open) return null;

  const hasUnselected = Object.keys(unselectedGrouped).length > 0;

  return (
    <Dialog.Root open={open} onOpenChange={(newOpen) => { if (!newOpen) handleCancel(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-surface-elevated rounded-xl shadow-2xl border border-border-default w-[650px] max-w-[95vw] max-h-[85vh] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-6 py-5 border-b border-border-default">
            <Dialog.Title className="text-xl font-semibold text-foreground">
              Adjust Columns
            </Dialog.Title>
            <p className="text-sm text-text-dim mt-1">
              Select up to 20 columns. Use the arrow buttons to reorder them (Year and Age are always first).
            </p>
            <div className="mt-4">
              <input
                type="text"
                placeholder="Search columns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 bg-bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-text-dimmer focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-4 overflow-y-auto flex-1">
            {/* Selected Columns */}
            <div className="mb-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-text-dim mb-3">
                Selected Columns {nonFrozenSelectedCount > 0 && <span className="text-text-dimmer normal-case tracking-normal font-normal">— use the arrows to reorder</span>}
              </h3>

              {selectedFiltered.length === 0 ? (
                <div className="py-6 text-center text-sm text-text-dim border border-dashed border-border rounded-lg">
                  {searchQuery ? `No selected columns match "${searchQuery}"` : 'No columns selected'}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {selectedFiltered.map((col, idx) => {
                    const isDragged = draggedId === col.id;
                    const isDragOver = dragOverId === col.id;
                    const canDrag = !col.frozen;

                    // Arrow-button enable logic — works in DISPLAYED order
                    const displayedIds = selectedOrdered.map((c) => c.id);
                    const displayIdx = displayedIds.indexOf(col.id);
                    const prevIsFrozen = displayIdx > 0 && columnMap.get(displayedIds[displayIdx - 1])?.frozen;
                    const isLastInDisplay = displayIdx === displayedIds.length - 1;
                    const canMoveUp = canDrag && displayIdx > 0 && !prevIsFrozen;
                    const canMoveDown = canDrag && !isLastInDisplay;

                    return (
                      <div
                        key={col.id}
                        draggable={canDrag}
                        onDragStart={(e) => handleDragStart(e, col.id)}
                        onDragOver={(e) => handleDragOver(e, col.id)}
                        onDragLeave={() => handleDragLeave(col.id)}
                        onDrop={(e) => handleDrop(e, col.id)}
                        onDragEnd={handleDragEnd}
                        className={`
                          flex items-start gap-2 p-2.5 rounded-lg border transition-all
                          ${isDragged ? 'opacity-40' : ''}
                          ${isDragOver ? 'border-primary bg-primary/5' : 'border-transparent bg-bg-card'}
                        `}
                      >
                        {/* Drag handle (still functional where supported) */}
                        <div
                          className={`
                            flex items-center self-stretch px-1 -my-0.5
                            ${canDrag ? 'cursor-grab active:cursor-grabbing text-text-dim hover:text-foreground' : 'text-text-dimmer/40 cursor-not-allowed'}
                          `}
                          title={canDrag ? 'Drag to reorder (or use the arrow buttons)' : 'Frozen column cannot be moved'}
                        >
                          <GripVertical className="w-4 h-4" />
                        </div>

                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked
                          onChange={() => handleRemove(col.id)}
                          disabled={col.frozen}
                          className="mt-1 rounded border-border bg-bg-card text-primary focus:ring-primary focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-60"
                        />

                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground flex items-center gap-2">
                            {col.label}
                            {col.frozen && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-text-dim">
                                FROZEN
                              </span>
                            )}
                          </div>
                          {col.description && (
                            <div className="text-xs text-text-dim mt-0.5">
                              {col.description}
                            </div>
                          )}
                        </div>

                        {/* Up/Down arrow buttons — primary reorder mechanism */}
                        {canDrag && (
                          <div className="flex flex-col gap-0.5 self-center">
                            <button
                              type="button"
                              onClick={() => moveBy(col.id, -1)}
                              disabled={!canMoveUp}
                              className={`
                                p-1 rounded transition-colors
                                ${canMoveUp ? 'text-text-dim hover:text-foreground hover:bg-white/10' : 'text-text-dimmer/40 cursor-not-allowed'}
                              `}
                              title="Move up"
                              aria-label={`Move ${col.label} up`}
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveBy(col.id, 1)}
                              disabled={!canMoveDown}
                              className={`
                                p-1 rounded transition-colors
                                ${canMoveDown ? 'text-text-dim hover:text-foreground hover:bg-white/10' : 'text-text-dimmer/40 cursor-not-allowed'}
                              `}
                              title="Move down"
                              aria-label={`Move ${col.label} down`}
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Available Columns */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-text-dim mb-3">
                Available Columns
              </h3>

              {!hasUnselected ? (
                <div className="py-6 text-center text-sm text-text-dim border border-dashed border-border rounded-lg">
                  {searchQuery ? `No available columns match "${searchQuery}"` : 'All columns are selected'}
                </div>
              ) : (
                (Object.keys(unselectedGrouped) as ColumnCategory[]).map((category) => {
                  const columns = unselectedGrouped[category];
                  if (!columns?.length) return null;
                  return (
                    <div key={category} className="mb-5 last:mb-0">
                      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-dimmer mb-2">
                        {CATEGORY_LABELS[category]}
                      </h4>
                      <div className="space-y-1.5">
                        {columns.map((col) => (
                          <label
                            key={col.id}
                            className="flex items-start gap-3 p-2.5 rounded-lg transition-colors cursor-pointer hover:bg-bg-card"
                          >
                            <input
                              type="checkbox"
                              checked={false}
                              onChange={() => handleAdd(col.id)}
                              className="mt-1 rounded border-border bg-bg-card text-primary focus:ring-primary focus:ring-offset-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-foreground">
                                {col.label}
                              </div>
                              {col.description && (
                                <div className="text-xs text-text-dim mt-0.5">
                                  {col.description}
                                </div>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border-default flex items-center justify-between shrink-0 bg-surface-elevated">
            <div className="text-sm text-text-dim">
              <span className="font-medium text-foreground">{nonFrozenSelectedCount}</span> / {MAX_NON_FROZEN} columns selected
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm border border-border rounded-lg text-foreground hover:bg-bg-card transition-colors"
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
