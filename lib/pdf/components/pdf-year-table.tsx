/**
 * PDF Year Table Component
 * Displays year-by-year projection data with milestone years (every 5 years)
 */

import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { Table, TR, TH, TD } from '@ag-media/react-pdf-table';
import type { YearlyResult } from '@/lib/calculations/types';
import { YEAR_TABLE_WEIGHTINGS } from '../styles';

interface PDFYearTableProps {
  years: YearlyResult[];
  title: string;
}

const tableStyles = StyleSheet.create({
  container: {
    marginBottom: 15,
  },
  title: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#111827', // gray-900
  },
  headerCell: {
    backgroundColor: '#f3f4f6', // gray-100
    padding: 4,
    fontSize: 7,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  cell: {
    padding: 4,
    fontSize: 7,
    textAlign: 'right',
    fontFamily: 'Helvetica',
  },
  cellLeft: {
    padding: 4,
    fontSize: 7,
    textAlign: 'center',
    fontFamily: 'Helvetica',
  },
  conversionRow: {
    backgroundColor: '#eff6ff', // blue-50
  },
  note: {
    fontSize: 7,
    color: '#6b7280', // gray-500
    marginTop: 6,
    fontStyle: 'italic',
  },
});

/**
 * Format cents to dollar string (compact)
 */
function formatCurrency(cents: number): string {
  const dollars = cents / 100;

  // Use compact notation for large numbers
  if (dollars >= 1_000_000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(dollars);
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(dollars);
}

/**
 * Get summarized milestone years (every 5 years + first + last)
 */
function getMilestoneYears(years: YearlyResult[]): YearlyResult[] {
  if (years.length === 0) return [];

  const firstYear = years[0];
  const lastYear = years[years.length - 1];
  const milestones: YearlyResult[] = [];

  // Always include first year
  milestones.push(firstYear);

  // Add every 5th year (by age)
  const startAge = firstYear.age;
  for (const year of years.slice(1)) {
    const yearsSinceStart = year.age - startAge;
    if (yearsSinceStart > 0 && yearsSinceStart % 5 === 0) {
      milestones.push(year);
    }
  }

  // Always include last year if not already included
  if (milestones[milestones.length - 1]?.year !== lastYear.year) {
    milestones.push(lastYear);
  }

  return milestones;
}

export function PDFYearTable({ years, title }: PDFYearTableProps) {
  const milestoneYears = getMilestoneYears(years);

  // Columns for the table
  const columns = [
    { key: 'year', label: 'Year' },
    { key: 'age', label: 'Age' },
    { key: 'traditional', label: 'Traditional' },
    { key: 'roth', label: 'Roth' },
    { key: 'taxable', label: 'Taxable' },
    { key: 'conversion', label: 'Conversion' },
    { key: 'tax', label: 'Total Tax' },
    { key: 'netWorth', label: 'Net Worth' },
  ];

  return (
    <View style={tableStyles.container}>
      <Text style={tableStyles.title}>{title}</Text>
      <Table weightings={YEAR_TABLE_WEIGHTINGS}>
        {/* Header Row */}
        <TR>
          {columns.map((col) => (
            <TH key={col.key} style={tableStyles.headerCell}>
              {col.label}
            </TH>
          ))}
        </TR>

        {/* Data Rows */}
        {milestoneYears.map((year) => {
          const hasConversion = year.conversionAmount > 0;
          const rowStyle = hasConversion ? tableStyles.conversionRow : {};

          return (
            <TR key={year.year}>
              <TD style={[tableStyles.cellLeft, rowStyle]}>{year.year}</TD>
              <TD style={[tableStyles.cellLeft, rowStyle]}>{year.age}</TD>
              <TD style={[tableStyles.cell, rowStyle]}>
                {formatCurrency(year.traditionalBalance)}
              </TD>
              <TD style={[tableStyles.cell, rowStyle]}>
                {formatCurrency(year.rothBalance)}
              </TD>
              <TD style={[tableStyles.cell, rowStyle]}>
                {formatCurrency(year.taxableBalance)}
              </TD>
              <TD style={[tableStyles.cell, rowStyle]}>
                {year.conversionAmount > 0
                  ? formatCurrency(year.conversionAmount)
                  : '-'}
              </TD>
              <TD style={[tableStyles.cell, rowStyle]}>
                {formatCurrency(year.totalTax)}
              </TD>
              <TD style={[tableStyles.cell, rowStyle]}>
                {formatCurrency(year.netWorth)}
              </TD>
            </TR>
          );
        })}
      </Table>
      <Text style={tableStyles.note}>
        Showing milestone years (every 5 years). Blue rows indicate conversion years.
      </Text>
    </View>
  );
}
