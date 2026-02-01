/**
 * PDF Document Types
 * Type definitions for PDF generation components
 */

import type {
  YearlyResult,
  StrategyComparisonMetrics,
  MultiStrategyResult,
  StrategyType,
} from '@/lib/calculations/types';

// =============================================================================
// Chart Images (captured from DOM via html-to-image)
// =============================================================================

/**
 * Base64-encoded PNG images of charts captured client-side
 * All images are optional since not all charts may be visible/rendered
 */
export interface ChartImages {
  wealth?: string;      // Wealth projection chart (base64 PNG)
  breakeven?: string;   // Breakeven analysis chart (base64 PNG)
  sensitivity?: string; // Sensitivity fan chart (base64 PNG)
}

// =============================================================================
// Summary Metrics
// =============================================================================

/**
 * High-level summary metrics for executive summary section
 * All currency values in cents
 */
export interface SummaryMetrics {
  endingWealth: number;       // Final year net worth (cents)
  taxSavings: number;         // Lifetime tax savings vs baseline (cents)
  breakEvenAge: number | null; // Age when cheatCode surpasses baseline
  totalIRMAA: number;         // Total IRMAA surcharges paid (cents)
  heirBenefit: number;        // Tax benefit to heirs (cents)
}

// =============================================================================
// PDF Data Props
// =============================================================================

/**
 * Complete data shape for PDF document generation
 */
export interface PDFDataProps {
  /** Summary metrics for executive summary */
  metrics: SummaryMetrics;

  /** Multi-strategy comparison result */
  multiStrategy: MultiStrategyResult;

  /** Best strategy identified */
  bestStrategy: StrategyType;

  /** Year-by-year results for baseline scenario */
  baselineYears: YearlyResult[];

  /** Year-by-year results for cheatCode (conversion) scenario */
  cheatCodeYears: YearlyResult[];

  /** Key milestone years for summarized table (every 5 years) */
  keyYears: YearlyResult[];
}

// =============================================================================
// PDF Document Props
// =============================================================================

/**
 * Main props for PDFDocument component
 */
export interface PDFDocumentProps {
  /** Client's full name for header */
  clientName: string;

  /** ISO timestamp when PDF was generated */
  generatedAt: string;

  /** Projection and metrics data */
  data: PDFDataProps;

  /** Optional chart images captured from DOM */
  chartImages?: ChartImages;
}

// =============================================================================
// PDF API Request/Response Types
// =============================================================================

/**
 * Request body for PDF generation API
 */
export interface PDFGenerationRequest {
  chartImages?: ChartImages;
}

/**
 * Response headers for PDF download
 */
export interface PDFResponseHeaders {
  'Content-Type': 'application/pdf';
  'Content-Disposition': string;
}

// =============================================================================
// Helper Types
// =============================================================================

/**
 * Year data row for PDF year table
 * Subset of YearlyResult for display purposes
 */
export interface YearTableRow {
  year: number;
  age: number;
  traditionalBalance: number;
  rothBalance: number;
  taxableBalance: number;
  conversionAmount: number;
  totalTax: number;
  netWorth: number;
}

/**
 * Strategy table row for PDF strategy comparison
 */
export interface StrategyTableRow {
  strategy: StrategyType;
  strategyName: string;
  metrics: StrategyComparisonMetrics;
  isBest: boolean;
}
