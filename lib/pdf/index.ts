/**
 * PDF Library
 * Barrel exports for PDF generation components
 */

// Main document component
export { PDFDocument } from './components/pdf-document';

// Individual components (for custom compositions)
export { PDFHeader } from './components/pdf-header';
export { PDFFooter } from './components/pdf-footer';
export { PDFSummary } from './components/pdf-summary';
export { PDFChartImage } from './components/pdf-chart-image';
export { PDFStrategyTable } from './components/pdf-strategy-table';
export { PDFYearTable } from './components/pdf-year-table';

// Types
export type {
  PDFDocumentProps,
  PDFDataProps,
  ChartImages,
  SummaryMetrics,
  YearTableRow,
  StrategyTableRow,
  PDFGenerationRequest,
  PDFResponseHeaders,
} from './types';

// Styles (for customization)
export {
  styles as pdfStyles,
  YEAR_TABLE_WEIGHTINGS,
  STRATEGY_TABLE_WEIGHTINGS,
} from './styles';
