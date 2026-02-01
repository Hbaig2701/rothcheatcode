/**
 * PDF Summary Component
 * Displays key metrics in a 2-column card layout
 */

import { View, Text, StyleSheet } from '@react-pdf/renderer';
import type { SummaryMetrics } from '../types';

interface PDFSummaryProps {
  metrics: SummaryMetrics;
}

const summaryStyles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  title: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#111827', // gray-900
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    width: '48%',
    padding: 10,
    backgroundColor: '#f9fafb', // gray-50
    borderRadius: 4,
  },
  label: {
    fontSize: 8,
    color: '#6b7280', // gray-500
    marginBottom: 2,
  },
  value: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  positive: {
    color: '#16a34a', // green-600
  },
  negative: {
    color: '#dc2626', // red-600
  },
  neutral: {
    color: '#111827', // gray-900
  },
  muted: {
    color: '#6b7280', // gray-500
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

export function PDFSummary({ metrics }: PDFSummaryProps) {
  const { endingWealth, taxSavings, breakEvenAge, totalIRMAA, heirBenefit } = metrics;

  return (
    <View style={summaryStyles.container}>
      <Text style={summaryStyles.title}>Key Metrics</Text>
      <View style={summaryStyles.grid}>
        {/* Row 1 */}
        <View style={summaryStyles.card}>
          <Text style={summaryStyles.label}>Ending Wealth (CheatCode)</Text>
          <Text style={[summaryStyles.value, summaryStyles.neutral]}>
            {formatCurrency(endingWealth)}
          </Text>
        </View>
        <View style={summaryStyles.card}>
          <Text style={summaryStyles.label}>Lifetime Tax Savings</Text>
          <Text
            style={[
              summaryStyles.value,
              taxSavings >= 0 ? summaryStyles.positive : summaryStyles.negative,
            ]}
          >
            {formatCurrency(taxSavings)}
          </Text>
        </View>

        {/* Row 2 */}
        <View style={summaryStyles.card}>
          <Text style={summaryStyles.label}>Breakeven Age</Text>
          <Text style={[summaryStyles.value, summaryStyles.neutral]}>
            {breakEvenAge !== null ? `Age ${breakEvenAge}` : 'N/A'}
          </Text>
        </View>
        <View style={summaryStyles.card}>
          <Text style={summaryStyles.label}>Total IRMAA Surcharges</Text>
          <Text
            style={[
              summaryStyles.value,
              totalIRMAA > 0 ? summaryStyles.negative : summaryStyles.muted,
            ]}
          >
            {totalIRMAA > 0 ? formatCurrency(totalIRMAA) : '$0'}
          </Text>
        </View>

        {/* Row 3 - Heir Benefit (full width if needed) */}
        <View style={summaryStyles.card}>
          <Text style={summaryStyles.label}>Heir Tax Benefit</Text>
          <Text
            style={[
              summaryStyles.value,
              heirBenefit > 0 ? summaryStyles.positive : summaryStyles.muted,
            ]}
          >
            {heirBenefit > 0 ? formatCurrency(heirBenefit) : '$0'}
          </Text>
        </View>
      </View>
    </View>
  );
}
