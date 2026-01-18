/**
 * PDF Strategy Table Component
 * Displays 4-strategy comparison with best strategy highlighted
 */

import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { Table, TR, TH, TD } from '@ag-media/react-pdf-table';
import { STRATEGY_DEFINITIONS, STRATEGIES } from '@/lib/calculations/strategy-definitions';
import type { MultiStrategyResult, StrategyType, StrategyComparisonMetrics } from '@/lib/calculations/types';
import { STRATEGY_TABLE_WEIGHTINGS } from '../styles';

interface PDFStrategyTableProps {
  result: MultiStrategyResult;
}

const tableStyles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  title: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#111827', // gray-900
  },
  headerCell: {
    backgroundColor: '#f3f4f6', // gray-100
    padding: 6,
    fontSize: 8,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  headerCellBest: {
    backgroundColor: '#dbeafe', // blue-100
    padding: 6,
    fontSize: 8,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  metricCell: {
    padding: 6,
    fontSize: 8,
    textAlign: 'left',
    fontWeight: 'bold',
  },
  cell: {
    padding: 6,
    fontSize: 8,
    textAlign: 'center',
  },
  cellBest: {
    padding: 6,
    fontSize: 8,
    textAlign: 'center',
    backgroundColor: '#eff6ff', // blue-50
  },
  cellPositive: {
    color: '#16a34a', // green-600
  },
  cellNegative: {
    color: '#dc2626', // red-600
  },
  cellWarning: {
    color: '#d97706', // amber-600
  },
  bestBadge: {
    fontSize: 6,
    color: '#2563eb', // blue-600
    fontWeight: 'bold',
    marginTop: 2,
  },
});

/**
 * Format cents to dollar string
 */
function formatCurrency(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(dollars);
}

/**
 * Get cell style based on whether this strategy is the best
 */
function getCellStyle(strategy: StrategyType, bestStrategy: StrategyType) {
  return strategy === bestStrategy ? tableStyles.cellBest : tableStyles.cell;
}

/**
 * Get header style based on whether this strategy is the best
 */
function getHeaderStyle(strategy: StrategyType, bestStrategy: StrategyType) {
  return strategy === bestStrategy ? tableStyles.headerCellBest : tableStyles.headerCell;
}

export function PDFStrategyTable({ result }: PDFStrategyTableProps) {
  const { comparisonMetrics, bestStrategy } = result;

  // Type for cell style (using typeof from StyleSheet)
  type CellStyle = typeof tableStyles.cellPositive;

  // Type for metrics configuration
  type MetricConfig = {
    key: string;
    label: string;
    getValue: (m: StrategyComparisonMetrics) => string;
    getColor?: (m: StrategyComparisonMetrics) => CellStyle | undefined;
  };

  // Metrics to display
  const metrics: MetricConfig[] = [
    {
      key: 'endingWealth',
      label: 'Ending Wealth',
      getValue: (m) => formatCurrency(m.endingWealth),
    },
    {
      key: 'taxSavings',
      label: 'Tax Savings',
      getValue: (m) => formatCurrency(m.taxSavings),
      getColor: (m) => m.taxSavings >= 0 ? tableStyles.cellPositive : tableStyles.cellNegative,
    },
    {
      key: 'breakEvenAge',
      label: 'Breakeven Age',
      getValue: (m) => m.breakEvenAge !== null ? `Age ${m.breakEvenAge}` : 'N/A',
    },
    {
      key: 'totalIRMAA',
      label: 'IRMAA Surcharges',
      getValue: (m) => m.totalIRMAA > 0 ? formatCurrency(m.totalIRMAA) : '$0',
      getColor: (m) => m.totalIRMAA > 0 ? tableStyles.cellWarning : undefined,
    },
    {
      key: 'heirBenefit',
      label: 'Heir Benefit',
      getValue: (m) => m.heirBenefit > 0 ? formatCurrency(m.heirBenefit) : '$0',
      getColor: (m) => m.heirBenefit > 0 ? tableStyles.cellPositive : undefined,
    },
  ];

  return (
    <View style={tableStyles.container}>
      <Text style={tableStyles.title}>Strategy Comparison</Text>
      <Table weightings={STRATEGY_TABLE_WEIGHTINGS}>
        {/* Header Row */}
        <TR>
          <TH style={tableStyles.headerCell}>Metric</TH>
          {STRATEGIES.map((strategy) => (
            <TH key={strategy} style={getHeaderStyle(strategy, bestStrategy)}>
              <View>
                <Text>{STRATEGY_DEFINITIONS[strategy].name}</Text>
                {strategy === bestStrategy && (
                  <Text style={tableStyles.bestBadge}>BEST</Text>
                )}
              </View>
            </TH>
          ))}
        </TR>

        {/* Data Rows */}
        {metrics.map((metric) => (
          <TR key={metric.key}>
            <TD style={tableStyles.metricCell}>{metric.label}</TD>
            {STRATEGIES.map((strategy) => {
              const m = comparisonMetrics[strategy];
              const colorStyle = metric.getColor?.(m);
              const styles = colorStyle
                ? [getCellStyle(strategy, bestStrategy), colorStyle]
                : getCellStyle(strategy, bestStrategy);
              return (
                <TD key={strategy} style={styles}>
                  {metric.getValue(m)}
                </TD>
              );
            })}
          </TR>
        ))}
      </Table>
    </View>
  );
}
