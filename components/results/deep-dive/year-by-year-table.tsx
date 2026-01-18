"use client";

import { YearlyResult } from "@/lib/calculations/types";
import { formatCurrency } from "@/lib/calculations/transforms";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Column configuration for the year-by-year table
 */
interface TableColumn {
  key: keyof YearlyResult;
  label: string;
  format: "none" | "currency";
  className?: string;
  highlight?: boolean;
}

const COLUMNS: TableColumn[] = [
  { key: "year", label: "Year", format: "none", className: "w-16" },
  { key: "age", label: "Age", format: "none", className: "w-14" },
  { key: "traditionalBalance", label: "Traditional IRA", format: "currency" },
  { key: "rothBalance", label: "Roth IRA", format: "currency" },
  { key: "taxableBalance", label: "Taxable", format: "currency" },
  { key: "rmdAmount", label: "RMD", format: "currency" },
  { key: "conversionAmount", label: "Conversion", format: "currency" },
  { key: "totalIncome", label: "Total Income", format: "currency" },
  { key: "federalTax", label: "Federal Tax", format: "currency" },
  { key: "stateTax", label: "State Tax", format: "currency" },
  { key: "irmaaSurcharge", label: "IRMAA", format: "currency" },
  { key: "netWorth", label: "Net Worth", format: "currency", highlight: true },
];

interface YearByYearTableProps {
  years: YearlyResult[];
  scenario: "baseline" | "blueprint";
}

/**
 * Year-by-year projection table with sticky header
 * Displays 12 columns of financial data with scrollable body
 * for 40+ years of projections
 */
export function YearByYearTable({ years, scenario }: YearByYearTableProps) {
  /**
   * Format a cell value based on column configuration
   */
  const formatValue = (value: number | null, format: "none" | "currency"): string => {
    if (value === null) return "-";
    if (format === "currency") {
      return formatCurrency(value);
    }
    return String(value);
  };

  /**
   * Check if this row has a conversion (for blueprint highlighting)
   */
  const hasConversion = (row: YearlyResult): boolean => {
    return scenario === "blueprint" && row.conversionAmount > 0;
  };

  return (
    <div className="max-h-[600px] overflow-auto rounded-md border">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            {COLUMNS.map((col) => (
              <TableHead
                key={col.key}
                className={cn(
                  "bg-muted/50",
                  col.className,
                  col.highlight && "bg-primary/10"
                )}
              >
                {col.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {years.map((row, index) => (
            <TableRow
              key={row.year}
              className={cn(
                index % 2 === 0 && "bg-muted/20",
                hasConversion(row) && "bg-blue-50/50 dark:bg-blue-950/20"
              )}
            >
              {COLUMNS.map((col) => (
                <TableCell
                  key={col.key}
                  className={cn(
                    "font-mono",
                    col.highlight && "bg-primary/10 font-semibold"
                  )}
                >
                  {formatValue(row[col.key] as number | null, col.format)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
