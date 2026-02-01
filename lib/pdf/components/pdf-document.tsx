/**
 * PDF Document Component
 * Main document structure with 3 pages: Executive Summary, Strategy Comparison, Year-by-Year
 */

import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { PDFHeader } from './pdf-header';
import { PDFFooter } from './pdf-footer';
import { PDFSummary } from './pdf-summary';
import { PDFChartImage } from './pdf-chart-image';
import { PDFStrategyTable } from './pdf-strategy-table';
import { PDFYearTable } from './pdf-year-table';
import type { PDFDocumentProps } from '../types';

const documentStyles = StyleSheet.create({
  // Portrait page
  page: {
    padding: 40,
    paddingBottom: 80, // Space for fixed footer
    fontSize: 10,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
  },
  // Landscape page
  pageLandscape: {
    padding: 30,
    paddingBottom: 60,
    fontSize: 9,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
  },
  // Section title
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#111827', // gray-900
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb', // gray-200
    paddingBottom: 8,
  },
  // Content section
  section: {
    marginBottom: 20,
  },
  // Page title for subsequent pages
  pageTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1e3a5f',
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 8,
    color: '#6b7280',
    marginBottom: 15,
  },
});

export function PDFDocument({
  clientName,
  generatedAt,
  data,
  chartImages,
}: PDFDocumentProps) {
  const { metrics, multiStrategy, cheatCodeYears, keyYears } = data;

  return (
    <Document
      title={`Roth Conversion Analysis - ${clientName}`}
      author="Rothc"
      subject="Roth Conversion Strategy Report"
      creator="Rothc"
    >
      {/* ================================================================== */}
      {/* Page 1: Executive Summary (Portrait) */}
      {/* ================================================================== */}
      <Page size="LETTER" style={documentStyles.page}>
        <PDFHeader clientName={clientName} generatedAt={generatedAt} />

        <View style={documentStyles.section}>
          <Text style={documentStyles.sectionTitle}>Executive Summary</Text>
          <PDFSummary metrics={metrics} />
        </View>

        {/* Wealth Projection Chart (if available) */}
        {chartImages?.wealth && (
          <PDFChartImage
            src={chartImages.wealth}
            title="Wealth Projection: Baseline vs Blueprint"
          />
        )}

        <PDFFooter />
      </Page>

      {/* ================================================================== */}
      {/* Page 2: Strategy Comparison (Portrait) */}
      {/* ================================================================== */}
      <Page size="LETTER" style={documentStyles.page}>
        <View>
          <Text style={documentStyles.pageTitle}>Roth Conversion Analysis</Text>
          <Text style={documentStyles.pageSubtitle}>{clientName}</Text>
        </View>

        <View style={documentStyles.section}>
          <Text style={documentStyles.sectionTitle}>Strategy Comparison</Text>
          <PDFStrategyTable result={multiStrategy} />
        </View>

        {/* Breakeven Chart (if available) */}
        {chartImages?.breakeven && (
          <PDFChartImage
            src={chartImages.breakeven}
            title="Breakeven Analysis"
            small
          />
        )}

        <PDFFooter />
      </Page>

      {/* ================================================================== */}
      {/* Page 3: Year-by-Year Projection (Landscape) */}
      {/* ================================================================== */}
      <Page size="LETTER" orientation="landscape" style={documentStyles.pageLandscape}>
        <View>
          <Text style={documentStyles.pageTitle}>Roth Conversion Analysis</Text>
          <Text style={documentStyles.pageSubtitle}>{clientName}</Text>
        </View>

        <View style={documentStyles.section}>
          <Text style={documentStyles.sectionTitle}>Year-by-Year Projection</Text>
          {/* Use keyYears if available, otherwise fall back to cheatCodeYears */}
          <PDFYearTable
            years={keyYears.length > 0 ? keyYears : cheatCodeYears}
            title="CheatCode Scenario (Recommended)"
          />
        </View>

        <PDFFooter />
      </Page>
    </Document>
  );
}
