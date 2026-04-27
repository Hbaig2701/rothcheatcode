'use client';

/**
 * Resizable Comparison Table
 *
 * Same as ResizableTable but each user-selected data column expands into three
 * sub-columns: Baseline | Strategy | Δ. Core columns (Year, Age, Spouse Age)
 * are rendered once — they're identifiers, not values to compare.
 *
 * Design notes:
 * - Two-row header. Row 1 is the column group (e.g. "Total Tax") spanning 3
 *   sub-columns. Row 2 has the sub-column labels. Core columns rowspan=2.
 * - Width persistence: each sub-column has its own key (`{id}__base`,
 *   `{id}__strat`, `{id}__diff`) so advisors can resize them independently.
 * - Diff color: by default positive diff (strategy > baseline) is green. For
 *   tax/IRMAA categories the convention is inverted — strategy paying less is
 *   the win — so negative diff renders green there.
 * - Diff is suppressed for non-numeric columns (anything that isn't formatted
 *   as currency/percent/number — e.g. Phase). The diff cell shows "—".
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { ColumnDefinition } from '@/lib/table-columns/column-definitions';
import type { YearlyResult } from '@/lib/calculations/types';

interface ResizableComparisonTableProps {
  columns: ColumnDefinition[];
  baselineData: YearlyResult[];
  strategyData: YearlyResult[];
  columnWidths: Record<string, number>;
  onColumnWidthChange: (columnId: string, width: number) => void;
  frozenColumnCount: number;
}

type SubColKind = 'base' | 'strat' | 'diff';

interface SubCol {
  id: string;            // e.g. "totalTax__base"
  parentId: string;      // e.g. "totalTax"
  kind: SubColKind;      // base | strat | diff
  parent: ColumnDefinition;
}

/**
 * Categories where lower is better — strategy paying LESS is the green outcome.
 * Diff color flips for these: negative diff (savings) renders green.
 */
const INVERSE_CATEGORIES = new Set(['taxes', 'irmaa']);

/**
 * Detect whether a column is numerically diff-able. Identifier-like columns
 * (Year, Age) and text columns (Phase, IRMAA tier formatted as "Standard")
 * shouldn't show a numeric diff.
 */
function isDiffable(col: ColumnDefinition): boolean {
  if (col.category === 'core') return false;
  // formatTier returns "Standard" / "Tier N" — not a numeric diff.
  if (col.id === 'irmaaTier') return false;
  // GI phase is a string label.
  if (col.id === 'giPhase' || col.id === 'phase') return false;
  return true;
}

export function ResizableComparisonTable({
  columns,
  baselineData,
  strategyData,
  columnWidths,
  onColumnWidthChange,
  frozenColumnCount,
}: ResizableComparisonTableProps) {
  const [resizing, setResizing] = useState<string | null>(null);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(0);
  const [tooltip, setTooltip] = useState<{ columnId: string; x: number; y: number } | null>(null);
  const tooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showTooltip = useCallback((columnId: string, e: React.MouseEvent) => {
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    tooltipTimeoutRef.current = setTimeout(() => {
      setTooltip({ columnId, x: rect.left + rect.width / 2, y: rect.top });
    }, 400);
  }, []);

  const hideTooltip = useCallback(() => {
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    setTooltip(null);
  }, []);

  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    };
  }, []);

  // Build the flat sub-column list. Core columns produce one sub-col, others
  // produce three (base/strat/diff). The frozen split runs against this flat
  // list — frozenColumnCount counts logical columns (matching the input).
  const frozenLogical = columns.slice(0, frozenColumnCount);
  const scrollableLogical = columns.slice(frozenColumnCount);

  const buildSubCols = (cols: ColumnDefinition[]): SubCol[] => {
    const out: SubCol[] = [];
    for (const col of cols) {
      if (col.category === 'core') {
        out.push({ id: col.id, parentId: col.id, kind: 'base', parent: col });
      } else {
        out.push({ id: `${col.id}__base`, parentId: col.id, kind: 'base', parent: col });
        out.push({ id: `${col.id}__strat`, parentId: col.id, kind: 'strat', parent: col });
        out.push({ id: `${col.id}__diff`, parentId: col.id, kind: 'diff', parent: col });
      }
    }
    return out;
  };

  const frozenSubCols = buildSubCols(frozenLogical);
  const scrollableSubCols = buildSubCols(scrollableLogical);

  // Width lookup. Sub-cols default to ~1/3 of the logical column's width to
  // keep total width consistent with the single-scenario tables.
  const getSubColWidth = (sc: SubCol): number => {
    if (columnWidths[sc.id]) return columnWidths[sc.id];
    const parentWidth = sc.parent.defaultWidth || 120;
    if (sc.parent.category === 'core') return parentWidth;
    // Floor a bit so 3 × subWidth ≈ parentWidth without overflow.
    return Math.max(80, Math.round(parentWidth * 0.7));
  };

  const handleMouseDown = (subId: string, currentWidth: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    setResizing(subId);
    setStartX(e.clientX);
    setStartWidth(currentWidth);
  };

  useEffect(() => {
    if (!resizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX;
      const newWidth = Math.max(60, startWidth + deltaX);
      onColumnWidthChange(resizing, newWidth);
    };
    const handleMouseUp = () => setResizing(null);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, startX, startWidth, onColumnWidthChange]);

  // Sticky offsets for frozen sub-columns.
  const frozenWidths = frozenSubCols.map(getSubColWidth);
  const frozenOffsets: number[] = [];
  let off = 0;
  for (const w of frozenWidths) {
    frozenOffsets.push(off);
    off += w;
  }

  const lastFrozenIndex = frozenSubCols.length - 1;

  // Build group spans for the top header row. Walk logical columns in order,
  // tracking how many sub-cols each takes, and whether the group ends inside
  // the frozen region (so we can extend the sticky-left offset for the group).
  const renderGroupHeader = (col: ColumnDefinition, isFrozen: boolean, frozenStart: number) => {
    const colSpan = col.category === 'core' ? 1 : 3;
    const subWidth = col.category === 'core'
      ? getSubColWidth({ id: col.id, parentId: col.id, kind: 'base', parent: col })
      : (
          getSubColWidth({ id: `${col.id}__base`, parentId: col.id, kind: 'base', parent: col }) +
          getSubColWidth({ id: `${col.id}__strat`, parentId: col.id, kind: 'strat', parent: col }) +
          getSubColWidth({ id: `${col.id}__diff`, parentId: col.id, kind: 'diff', parent: col })
        );

    // For frozen group headers, sticky to left edge using the offset of the
    // first sub-col in this group.
    const stickyStyle: React.CSSProperties = {
      position: 'sticky',
      top: 0,
      ...(isFrozen ? { left: `${frozenOffsets[frozenStart]}px`, zIndex: 30 } : { zIndex: 20 }),
    };

    return (
      <th
        key={`group-${col.id}`}
        colSpan={colSpan}
        rowSpan={col.category === 'core' ? 2 : 1}
        style={{
          width: `${subWidth}px`,
          minWidth: `${subWidth}px`,
          maxWidth: `${subWidth}px`,
          ...stickyStyle,
        }}
        className={`
          relative border-b border-border-default bg-surface-elevated px-3 py-2.5
          ${col.category === 'core' ? 'text-left' : 'text-center'}
          text-xs font-semibold text-text-muted uppercase tracking-wider
          ${col.description ? 'cursor-help' : ''}
        `}
        onMouseEnter={col.description ? (e) => showTooltip(col.id, e) : undefined}
        onMouseLeave={col.description ? hideTooltip : undefined}
      >
        {col.label}
      </th>
    );
  };

  const renderSubHeader = (sc: SubCol, subColIndex: number) => {
    const width = getSubColWidth(sc);
    const isFrozen = subColIndex <= lastFrozenIndex;
    const isLastFrozen = subColIndex === lastFrozenIndex;
    if (sc.parent.category === 'core') return null; // covered by rowspan=2

    const labelMap: Record<SubColKind, string> = {
      base: 'Baseline',
      strat: 'Strategy',
      diff: 'Δ',
    };

    const stickyStyle: React.CSSProperties = {
      position: 'sticky',
      top: 38, // Below group-header row
      ...(isFrozen ? { left: `${frozenOffsets[subColIndex]}px`, zIndex: 25 } : { zIndex: 15 }),
    };

    return (
      <th
        key={`sub-${sc.id}`}
        style={{
          width: `${width}px`,
          minWidth: `${width}px`,
          maxWidth: `${width}px`,
          ...stickyStyle,
        }}
        className={`
          relative border-b border-border-default bg-surface-elevated px-3 py-1.5 text-right text-[11px] font-medium text-text-dim uppercase tracking-wider
          ${isLastFrozen ? 'border-r-2 border-r-primary/30' : ''}
        `}
      >
        {labelMap[sc.kind]}
        <div
          className={`
            absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary transition-colors
            ${resizing === sc.id ? 'bg-primary' : 'bg-transparent'}
          `}
          onMouseDown={handleMouseDown(sc.id, width)}
        />
      </th>
    );
  };

  /**
   * Render one cell. For core columns the value comes from baseline (it's the
   * same in both — Year/Age are identifiers). For data columns we read the
   * baseline/strategy values and compute diff.
   */
  const renderCell = (
    sc: SubCol,
    rowIndex: number,
    isFrozen: boolean,
    subColIndex: number,
  ) => {
    const width = getSubColWidth(sc);
    const isLastFrozen = subColIndex === lastFrozenIndex;
    const bgClass = rowIndex % 2 === 0 ? 'bg-background' : 'bg-bg-card';
    const baseRow = baselineData[rowIndex];
    const stratRow = strategyData[rowIndex];

    let contents: React.ReactNode = '—';
    let extraClass = '';
    const isNumeric = sc.parent.category !== 'core';
    const alignClass = isNumeric ? 'text-right font-mono tabular-nums' : 'text-left';

    if (sc.parent.category === 'core') {
      const v = (baseRow as unknown as Record<string, unknown>)?.[sc.parentId];
      contents = sc.parent.formatter(v);
    } else if (sc.kind === 'base') {
      const v = (baseRow as unknown as Record<string, unknown>)?.[sc.parentId];
      contents = sc.parent.formatter(v);
      extraClass = 'text-text-muted';
    } else if (sc.kind === 'strat') {
      const v = (stratRow as unknown as Record<string, unknown>)?.[sc.parentId];
      contents = sc.parent.formatter(v);
      extraClass = 'text-foreground';
    } else if (sc.kind === 'diff') {
      if (isDiffable(sc.parent)) {
        const baseVal = Number((baseRow as unknown as Record<string, unknown>)?.[sc.parentId] ?? 0);
        const stratVal = Number((stratRow as unknown as Record<string, unknown>)?.[sc.parentId] ?? 0);
        const delta = stratVal - baseVal;
        const inverse = INVERSE_CATEGORIES.has(sc.parent.category);
        // Green = "good for strategy". For inverse categories (taxes, IRMAA),
        // strategy paying less is good → negative delta is green.
        const isWin = inverse ? delta < 0 : delta > 0;
        const isLoss = inverse ? delta > 0 : delta < 0;
        const sign = delta > 0 ? '+' : '';
        contents = `${sign}${sc.parent.formatter(delta)}`;
        extraClass = isWin ? 'text-green font-medium' : isLoss ? 'text-red font-medium' : 'text-text-dim';
      } else {
        contents = '—';
        extraClass = 'text-text-dim';
      }
    }

    return (
      <td
        key={`${sc.id}-${rowIndex}`}
        style={{
          width: `${width}px`,
          minWidth: `${width}px`,
          maxWidth: `${width}px`,
          ...(isFrozen ? { position: 'sticky' as const, left: `${frozenOffsets[subColIndex]}px`, zIndex: 5 } : {}),
        }}
        className={`
          border-b border-border-default/50 px-3 py-2 text-sm
          ${bgClass}
          ${alignClass}
          ${extraClass}
          ${isLastFrozen ? 'border-r-2 border-r-primary/30' : ''}
        `}
      >
        {contents}
      </td>
    );
  };

  const tooltipColumn = tooltip ? columns.find(c => c.id === tooltip.columnId) : null;

  // Compute group header start indices for frozen vs scrollable groups so the
  // sticky-left offset matches the first sub-col in each group.
  let frozenGroupCursor = 0;
  let scrollableGroupCursor = 0; // unused for offsets, but useful symmetry
  void scrollableGroupCursor;

  const rowCount = Math.min(baselineData.length, strategyData.length);

  return (
    <div className="relative border border-border-default rounded-lg overflow-hidden bg-background w-full">
      {tooltip && tooltipColumn?.description && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y - 8}px`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="bg-surface-elevated border border-primary/40 rounded-lg px-3 py-2 shadow-xl max-w-xs">
            <p className="text-xs font-semibold text-primary mb-1">{tooltipColumn.label}</p>
            <p className="text-xs text-foreground/80 leading-relaxed">{tooltipColumn.description}</p>
          </div>
          <div className="flex justify-center">
            <div className="w-2 h-2 bg-surface-elevated border-r border-b border-primary/40 transform rotate-45 -mt-1" />
          </div>
        </div>,
        document.body
      )}
      <div className="max-h-[600px] overflow-auto w-full">
        <table className="w-max min-w-full" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            {/* Group header row */}
            <tr>
              {frozenLogical.map((col) => {
                const start = frozenGroupCursor;
                frozenGroupCursor += col.category === 'core' ? 1 : 3;
                return renderGroupHeader(col, true, start);
              })}
              {scrollableLogical.map((col) => renderGroupHeader(col, false, 0))}
            </tr>
            {/* Sub-header row (Baseline | Strategy | Δ for data cols only) */}
            <tr>
              {frozenSubCols.map((sc, i) => renderSubHeader(sc, i))}
              {scrollableSubCols.map((sc, i) => renderSubHeader(sc, frozenSubCols.length + i))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }).map((_, rowIdx) => (
              <tr key={rowIdx}>
                {frozenSubCols.map((sc, i) => renderCell(sc, rowIdx, true, i))}
                {scrollableSubCols.map((sc, i) => renderCell(sc, rowIdx, false, frozenSubCols.length + i))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rowCount === 0 && (
        <div className="py-12 text-center text-sm text-text-dim">
          No data available
        </div>
      )}
    </div>
  );
}
