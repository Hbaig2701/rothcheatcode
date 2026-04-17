'use client';

/**
 * Resizable Table with Frozen Columns
 *
 * Features:
 * - Frozen left columns (Year, Age, Spouse Age) via CSS sticky
 * - Horizontal scroll for remaining columns
 * - Resizable column widths with drag handles
 * - Min width enforcement (60px)
 * - Single <table> ensures row heights are always synchronized
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { ColumnDefinition } from '@/lib/table-columns/column-definitions';
import type { YearlyResult } from '@/lib/calculations/types';

interface ResizableTableProps {
  columns: ColumnDefinition[];
  data: YearlyResult[];
  columnWidths: Record<string, number>;
  onColumnWidthChange: (columnId: string, width: number) => void;
  frozenColumnCount: number; // How many columns to freeze from left
}

export function ResizableTable({
  columns,
  data,
  columnWidths,
  onColumnWidthChange,
  frozenColumnCount,
}: ResizableTableProps) {
  const [resizing, setResizing] = useState<string | null>(null);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(0);
  const [tooltip, setTooltip] = useState<{ columnId: string; x: number; y: number } | null>(null);
  const tooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showTooltip = useCallback((columnId: string, e: React.MouseEvent) => {
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    // Capture rect immediately — e.currentTarget is null after the event completes
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

  const frozenColumns = columns.slice(0, frozenColumnCount);
  const scrollableColumns = columns.slice(frozenColumnCount);

  const handleMouseDown = (columnId: string, currentWidth: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    setResizing(columnId);
    setStartX(e.clientX);
    setStartWidth(currentWidth);
  };

  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX;
      const newWidth = Math.max(60, startWidth + deltaX); // Min 60px
      onColumnWidthChange(resizing, newWidth);
    };

    const handleMouseUp = () => {
      setResizing(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, startX, startWidth, onColumnWidthChange]);

  const getColumnWidth = (col: ColumnDefinition): number => {
    return columnWidths[col.id] || col.defaultWidth || 120;
  };

  // Calculate total width of frozen columns for sticky offsets
  const frozenWidths = frozenColumns.map(getColumnWidth);
  const frozenOffsets: number[] = [];
  let offset = 0;
  for (const w of frozenWidths) {
    frozenOffsets.push(offset);
    offset += w;
  }
  const totalFrozenWidth = offset;

  const renderHeader = (col: ColumnDefinition, isFrozen: boolean, frozenIndex: number) => {
    const width = getColumnWidth(col);
    const isLastFrozen = isFrozen && frozenIndex === frozenColumns.length - 1;
    const effectiveAlign = col.align ?? (col.category === 'core' ? 'left' : 'right');
    const isNumeric = effectiveAlign === 'right';
    const alignClass = isNumeric ? 'text-right' : 'text-left';

    // Frozen headers: sticky top + left (z-30)
    // Scrollable headers: sticky top only (z-20)
    const stickyStyle: React.CSSProperties = {
      position: 'sticky',
      top: 0,
      ...(isFrozen ? { left: `${frozenOffsets[frozenIndex]}px`, zIndex: 30 } : { zIndex: 20 }),
    };

    return (
      <th
        key={col.id}
        style={{
          width: `${width}px`,
          minWidth: `${width}px`,
          maxWidth: `${width}px`,
          ...stickyStyle,
        }}
        className={`
          relative border-b border-border-default bg-surface-elevated px-3 py-2.5 ${alignClass} text-xs font-semibold text-text-muted uppercase tracking-wider
          ${isLastFrozen ? 'border-r-2 border-r-primary/30' : ''}
          ${col.description ? 'cursor-help' : ''}
        `}
        onMouseEnter={col.description ? (e) => showTooltip(col.id, e) : undefined}
        onMouseLeave={col.description ? hideTooltip : undefined}
      >
        {col.label}
        {/* Resize handle */}
        <div
          className={`
            absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary transition-colors
            ${resizing === col.id ? 'bg-primary' : 'bg-transparent'}
          `}
          onMouseDown={handleMouseDown(col.id, width)}
        />
      </th>
    );
  };

  const renderCell = (col: ColumnDefinition, row: YearlyResult, rowIndex: number, isFrozen: boolean, frozenIndex: number) => {
    const width = getColumnWidth(col);
    const value = (row as any)[col.id];
    const formatted = col.formatter(value);
    const isLastFrozen = isFrozen && frozenIndex === frozenColumns.length - 1;
    const bgClass = rowIndex % 2 === 0 ? 'bg-background' : 'bg-bg-card';
    // Right-align numeric columns for readability. Core (Year/Age) stays left-aligned.
    // Allow column definitions to override alignment via `align` (e.g. Phase is text).
    const effectiveAlign = col.align ?? (col.category === 'core' ? 'left' : 'right');
    const isNumeric = effectiveAlign === 'right';
    const alignClass = isNumeric ? 'text-right font-mono tabular-nums' : 'text-left';

    return (
      <td
        key={`${col.id}-${rowIndex}`}
        style={{
          width: `${width}px`,
          minWidth: `${width}px`,
          maxWidth: `${width}px`,
          ...(isFrozen ? { position: 'sticky' as const, left: `${frozenOffsets[frozenIndex]}px`, zIndex: 5 } : {}),
        }}
        className={`
          border-b border-border-default/50 px-3 py-2 text-sm text-foreground/80
          ${bgClass}
          ${alignClass}
          ${isLastFrozen ? 'border-r-2 border-r-primary/30' : ''}
        `}
      >
        {formatted}
      </td>
    );
  };

  const tooltipColumn = tooltip ? columns.find(c => c.id === tooltip.columnId) : null;

  return (
    <div className="relative border border-border-default rounded-lg overflow-hidden bg-background w-full">
      {/* Column description tooltip - rendered via portal to escape overflow-hidden */}
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
          {/* Arrow */}
          <div className="flex justify-center">
            <div className="w-2 h-2 bg-surface-elevated border-r border-b border-primary/40 transform rotate-45 -mt-1" />
          </div>
        </div>,
        document.body
      )}
      {/* Single scrollable container */}
      <div className="max-h-[600px] overflow-auto w-full">
        <table className="w-max min-w-full" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr>
              {frozenColumns.map((col, i) => renderHeader(col, true, i))}
              {scrollableColumns.map((col) => renderHeader(col, false, -1))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr key={idx}>
                {frozenColumns.map((col, i) => renderCell(col, row, idx, true, i))}
                {scrollableColumns.map((col) => renderCell(col, row, idx, false, -1))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Empty state */}
      {data.length === 0 && (
        <div className="py-12 text-center text-sm text-text-dim">
          No data available
        </div>
      )}
    </div>
  );
}
