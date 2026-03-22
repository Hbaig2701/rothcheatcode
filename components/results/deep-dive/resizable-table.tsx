'use client';

/**
 * Resizable Table with Frozen Columns
 *
 * Features:
 * - Frozen left columns (Year, Age, Spouse Age)
 * - Horizontal scroll for remaining columns
 * - Resizable column widths with drag handles
 * - Min width enforcement (60px)
 * - Synchronized row heights
 */

import { useState, useEffect, useRef } from 'react';
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

  const renderHeader = (col: ColumnDefinition) => {
    const width = getColumnWidth(col);
    return (
      <th
        key={col.id}
        style={{ width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }}
        className="relative border-b border-white/10 bg-[#1a1a1a] px-3 py-2.5 text-left text-xs font-semibold text-white/70 uppercase tracking-wider"
      >
        {col.label}
        {/* Resize handle */}
        <div
          className={`
            absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-[#d4af37] transition-colors
            ${resizing === col.id ? 'bg-[#d4af37]' : 'bg-transparent'}
          `}
          onMouseDown={handleMouseDown(col.id, width)}
        />
      </th>
    );
  };

  const renderCell = (col: ColumnDefinition, row: YearlyResult, rowIndex: number) => {
    const width = getColumnWidth(col);
    const value = (row as any)[col.id];
    const formatted = col.formatter(value);

    return (
      <td
        key={`${col.id}-${rowIndex}`}
        style={{ width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }}
        className={`
          border-b border-white/5 px-3 py-2 text-sm text-white/80
          ${rowIndex % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.02]'}
        `}
      >
        {formatted}
      </td>
    );
  };

  return (
    <div className="relative border border-white/10 rounded-lg overflow-hidden bg-[#0a0a0a] w-full">
      {/* Single scrollable container for vertical scroll */}
      <div className="max-h-[600px] overflow-y-auto w-full">
        <div className="flex min-w-0">
          {/* Frozen columns (left) - sticky position */}
          {frozenColumns.length > 0 && (
            <div className="flex-shrink-0 border-r-2 border-[#d4af37]/30 sticky left-0 z-10 bg-[#0a0a0a]">
              <table className="border-collapse">
                <thead className="sticky top-0 z-20 bg-[#1a1a1a]">
                  <tr>
                    {frozenColumns.map(renderHeader)}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, idx) => (
                    <tr key={idx}>
                      {frozenColumns.map((col) => renderCell(col, row, idx))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Scrollable columns (right) - horizontal scroll only */}
          {scrollableColumns.length > 0 && (
            <div className="flex-1 overflow-x-auto">
              <table className="border-collapse w-full">
                <thead className="sticky top-0 z-10 bg-[#1a1a1a]">
                  <tr>
                    {scrollableColumns.map(renderHeader)}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, idx) => (
                    <tr key={idx}>
                      {scrollableColumns.map((col) => renderCell(col, row, idx))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Empty state */}
      {data.length === 0 && (
        <div className="py-12 text-center text-sm text-white/50">
          No data available
        </div>
      )}
    </div>
  );
}
