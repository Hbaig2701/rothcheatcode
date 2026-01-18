/**
 * PDF StyleSheet Definitions
 * Reusable styles for all PDF components
 */

import { StyleSheet } from '@react-pdf/renderer';

/**
 * Main stylesheet for PDF document components
 */
export const styles = StyleSheet.create({
  // ==========================================================================
  // Page Layout
  // ==========================================================================
  page: {
    padding: 40,
    paddingBottom: 80, // Space for fixed footer
    fontSize: 10,
    fontFamily: 'Helvetica',
  },

  pageLandscape: {
    padding: 30,
    paddingBottom: 60,
    fontSize: 9,
    fontFamily: 'Helvetica',
  },

  // ==========================================================================
  // Sections
  // ==========================================================================
  section: {
    marginBottom: 15,
  },

  sectionLarge: {
    marginBottom: 25,
  },

  // ==========================================================================
  // Typography
  // ==========================================================================
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
  },

  subtitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 8,
  },

  text: {
    fontSize: 9,
    lineHeight: 1.4,
  },

  textMuted: {
    fontSize: 8,
    color: '#666666',
  },

  textSmall: {
    fontSize: 7,
    color: '#999999',
  },

  // ==========================================================================
  // Charts
  // ==========================================================================
  chartImage: {
    width: '100%',
    height: 200,
    objectFit: 'contain',
  },

  chartImageSmall: {
    width: '100%',
    height: 160,
    objectFit: 'contain',
  },

  // ==========================================================================
  // Footer
  // ==========================================================================
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
  },

  disclaimer: {
    fontSize: 7,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 5,
  },

  pageNumber: {
    fontSize: 8,
    textAlign: 'center',
    color: '#999999',
  },

  // ==========================================================================
  // Flexbox Rows
  // ==========================================================================
  row: {
    flexDirection: 'row',
    marginBottom: 4,
  },

  rowSpaceBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },

  // ==========================================================================
  // Labels and Values
  // ==========================================================================
  label: {
    fontSize: 9,
    fontWeight: 'bold',
    width: 120,
  },

  value: {
    fontSize: 9,
  },

  // ==========================================================================
  // Color Utilities
  // ==========================================================================
  positive: {
    color: '#16a34a', // green-600
  },

  negative: {
    color: '#dc2626', // red-600
  },

  warning: {
    color: '#d97706', // amber-600
  },

  muted: {
    color: '#6b7280', // gray-500
  },

  // ==========================================================================
  // Table Cells
  // ==========================================================================
  headerCell: {
    backgroundColor: '#f3f4f6', // gray-100
    padding: 6,
    fontSize: 8,
    fontWeight: 'bold',
  },

  cell: {
    padding: 6,
    fontSize: 8,
    textAlign: 'center',
  },

  cellLeft: {
    padding: 6,
    fontSize: 8,
    textAlign: 'left',
  },

  cellRight: {
    padding: 6,
    fontSize: 8,
    textAlign: 'right',
    fontFamily: 'Helvetica',
  },

  // ==========================================================================
  // Best Strategy Highlighting
  // ==========================================================================
  bestCell: {
    backgroundColor: '#eff6ff', // blue-50
  },

  bestHeader: {
    backgroundColor: '#dbeafe', // blue-100
  },

  // ==========================================================================
  // Metric Labels (for strategy table)
  // ==========================================================================
  metricLabel: {
    textAlign: 'left',
    fontWeight: 'bold',
  },

  // ==========================================================================
  // Header Section
  // ==========================================================================
  header: {
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb', // gray-200
    paddingBottom: 15,
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },

  headerSubtitle: {
    fontSize: 10,
    color: '#6b7280', // gray-500
  },

  // ==========================================================================
  // Summary Cards
  // ==========================================================================
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 15,
  },

  summaryCard: {
    width: '48%',
    padding: 10,
    backgroundColor: '#f9fafb', // gray-50
    borderRadius: 4,
  },

  summaryCardLabel: {
    fontSize: 8,
    color: '#6b7280', // gray-500
    marginBottom: 2,
  },

  summaryCardValue: {
    fontSize: 12,
    fontWeight: 'bold',
  },

  // ==========================================================================
  // Conversion Row Highlighting
  // ==========================================================================
  conversionRow: {
    backgroundColor: '#eff6ff', // blue-50
  },

  // ==========================================================================
  // Divider
  // ==========================================================================
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb', // gray-200
    marginVertical: 10,
  },
});

/**
 * Table column weightings for year-by-year table
 * Must sum to 1.0
 */
export const YEAR_TABLE_WEIGHTINGS = [
  0.08, // Year
  0.08, // Age
  0.14, // Traditional
  0.14, // Roth
  0.14, // Taxable
  0.14, // Conversion
  0.14, // Tax
  0.14, // Net Worth
];

/**
 * Table column weightings for strategy comparison table
 * 5 columns: metric label + 4 strategies
 * Must sum to 1.0
 */
export const STRATEGY_TABLE_WEIGHTINGS = [
  0.24, // Metric label
  0.19, // Conservative
  0.19, // Moderate
  0.19, // Aggressive
  0.19, // IRMAA Safe
];
