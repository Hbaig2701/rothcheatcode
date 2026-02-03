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

export function PDFDocument({
  clientName,
  generatedAt,
  data,
  chartImages,
  branding,
}: PDFDocumentProps) {
  const { metrics, multiStrategy, formulaYears, keyYears } = data;

  const primaryColor = branding?.primaryColor || '#1e3a5f';
  const secondaryColor = branding?.secondaryColor || '#14b8a6';
  const companyName = branding?.companyName || 'Roth Formula';

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
      color: primaryColor,
      borderBottomWidth: 2,
      borderBottomColor: secondaryColor,
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
      color: primaryColor,
      marginBottom: 4,
    },
    pageSubtitle: {
      fontSize: 8,
      color: '#6b7280',
      marginBottom: 15,
    },
  });

  return (
    <Document
      title={`Roth Conversion Analysis - ${clientName}`}
      author={companyName}
      subject="Roth Conversion Strategy Report"
      creator={companyName}
    >
      {/* ================================================================== */}
      {/* Page 1: Executive Summary (Portrait) */}
      {/* ================================================================== */}
      <Page size="LETTER" style={documentStyles.page}>
        <PDFHeader clientName={clientName} generatedAt={generatedAt} branding={branding} />

        <View style={documentStyles.section}>
          <Text style={documentStyles.sectionTitle}>Executive Summary</Text>
          <PDFSummary metrics={metrics} />
        </View>

        {/* Wealth Projection Chart (if available) */}
        {chartImages?.wealth && (
          <PDFChartImage
            src={chartImages.wealth}
            title="Wealth Projection: Baseline vs Formula"
          />
        )}

        <PDFFooter branding={branding} />
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

        <PDFFooter branding={branding} />
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
          {/* Use keyYears if available, otherwise fall back to formulaYears */}
          <PDFYearTable
            years={keyYears.length > 0 ? keyYears : formulaYears}
            title="Formula Scenario (Recommended)"
          />
        </View>

        <PDFFooter branding={branding} />
      </Page>
    </Document>
  );
}
