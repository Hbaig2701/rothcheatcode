# Phase 09: PDF Export - Research

**Researched:** 2026-01-18
**Domain:** PDF Generation with React, Charts to PDF, Server-Side Rendering
**Confidence:** MEDIUM

## Summary

PDF generation in Next.js 15 with @react-pdf/renderer presents some specific challenges, particularly around server-side rendering in the App Router and integrating Recharts v3+ charts. The project uses recharts 3.6.0, which is NOT compatible with react-pdf-charts (the standard library for embedding charts in PDFs). This requires an alternative approach.

The recommended architecture is a **hybrid client-server approach**: charts are rendered on the client side and converted to base64 PNG images, which are then passed to a server-side API route that generates the PDF using @react-pdf/renderer. This approach works around the recharts v3 incompatibility and the Next.js App Router SSR complexities.

**Primary recommendation:** Use @react-pdf/renderer with server-side generation via API route, converting Recharts charts to PNG images on the client before PDF generation.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @react-pdf/renderer | ^4.3.2 | PDF document generation | Industry standard for React PDF generation, supports React 19 |
| @ag-media/react-pdf-table | ^1.x | Table components for PDF | Best-maintained table library for react-pdf |
| html-to-image | ^1.11.x | Convert DOM elements to images | More reliable than html2canvas for chart conversion |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| file-saver | ^2.0.x | Client-side file downloads | Alternative to native download if needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @react-pdf/renderer | jsPDF | jsPDF has no JSX/React component model |
| @react-pdf/renderer | puppeteer | Heavy dependency, requires headless browser |
| html-to-image | html2canvas | html2canvas has more issues with SVG rendering |
| @ag-media/react-pdf-table | Manual View/Text layout | Table library handles borders, alignment automatically |

**Installation:**
```bash
npm install @react-pdf/renderer @ag-media/react-pdf-table html-to-image
```

## Architecture Patterns

### Recommended Project Structure
```
app/
  api/
    pdf/
      [clientId]/
        route.ts           # PDF generation endpoint
lib/
  pdf/
    components/
      PDFDocument.tsx      # Main document structure
      PDFHeader.tsx        # Header with logo, title
      PDFSummary.tsx       # Summary metrics section
      PDFStrategyTable.tsx # Strategy comparison table
      PDFYearTable.tsx     # Year-by-year data table
      PDFChartImage.tsx    # Chart image wrapper
      PDFFooter.tsx        # Disclaimer and page numbers
    styles.ts              # StyleSheet definitions
    types.ts               # PDF-specific types
components/
  results/
    pdf-export-button.tsx  # Client-side export trigger
hooks/
  use-pdf-export.ts        # Chart capture and PDF generation hook
```

### Pattern 1: Hybrid Client-Server PDF Generation
**What:** Client captures charts as images, server generates PDF
**When to use:** When using interactive charts (Recharts, Chart.js) that cannot be directly rendered in react-pdf
**Example:**
```typescript
// Client: hooks/use-pdf-export.ts
import { toPng } from 'html-to-image';

export function usePDFExport() {
  const [isGenerating, setIsGenerating] = useState(false);

  const generatePDF = async (chartRefs: RefObject<HTMLDivElement>[]) => {
    setIsGenerating(true);

    // Capture all charts as base64 PNG
    const chartImages = await Promise.all(
      chartRefs.map(async (ref) => {
        if (!ref.current) return null;
        return toPng(ref.current, { quality: 0.95 });
      })
    );

    // Send to server for PDF generation
    const response = await fetch(`/api/pdf/${clientId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartImages }),
    });

    const blob = await response.blob();
    // Trigger download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roth-conversion-report-${clientId}.pdf`;
    a.click();
    URL.revokeObjectURL(url);

    setIsGenerating(false);
  };

  return { generatePDF, isGenerating };
}
```

### Pattern 2: Server-Side PDF API Route
**What:** Next.js route handler that generates PDF buffer
**When to use:** All PDF generation requests
**Example:**
```typescript
// app/api/pdf/[clientId]/route.ts
import { pdf } from '@react-pdf/renderer';
import { PDFDocument } from '@/lib/pdf/components/PDFDocument';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const { chartImages } = await request.json();

  // Fetch projection data
  const projectionData = await getProjectionData(clientId);

  // Generate PDF
  const buffer = await pdf(
    <PDFDocument
      data={projectionData}
      chartImages={chartImages}
    />
  ).toBuffer();

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="roth-report-${clientId}.pdf"`,
    },
  });
}
```

### Pattern 3: Fixed Footer with Page Numbers
**What:** Persistent footer on every page with disclaimer and page numbers
**When to use:** Professional reports requiring legal disclaimers
**Example:**
```typescript
// lib/pdf/components/PDFFooter.tsx
import { Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
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
});

export function PDFFooter() {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.disclaimer}>
        This report is for informational purposes only and does not constitute
        financial, tax, or legal advice. Consult a qualified professional before
        making any financial decisions.
      </Text>
      <Text
        style={styles.pageNumber}
        render={({ pageNumber, totalPages }) => (
          `Page ${pageNumber} of ${totalPages}`
        )}
      />
    </View>
  );
}
```

### Pattern 4: Table with Column Weightings
**What:** Consistent column widths using @ag-media/react-pdf-table
**When to use:** Year-by-year tables, strategy comparison tables
**Example:**
```typescript
// lib/pdf/components/PDFYearTable.tsx
import { Table, TR, TH, TD } from '@ag-media/react-pdf-table';
import { StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  table: { marginTop: 10 },
  headerCell: {
    backgroundColor: '#f3f4f6',
    fontWeight: 'bold',
    fontSize: 8,
    padding: 4,
  },
  cell: {
    fontSize: 8,
    padding: 4,
    fontFamily: 'Helvetica',
  },
});

interface YearTableProps {
  years: YearlyResult[];
}

export function PDFYearTable({ years }: YearTableProps) {
  // Weightings must sum to 1
  const weightings = [0.08, 0.08, 0.14, 0.14, 0.14, 0.14, 0.14, 0.14];

  return (
    <Table style={styles.table} weightings={weightings}>
      <TH>
        <TD style={styles.headerCell}>Year</TD>
        <TD style={styles.headerCell}>Age</TD>
        <TD style={styles.headerCell}>Traditional</TD>
        <TD style={styles.headerCell}>Roth</TD>
        <TD style={styles.headerCell}>Taxable</TD>
        <TD style={styles.headerCell}>Conversion</TD>
        <TD style={styles.headerCell}>Tax</TD>
        <TD style={styles.headerCell}>Net Worth</TD>
      </TH>
      {years.map((year) => (
        <TR key={year.year}>
          <TD style={styles.cell}>{year.year}</TD>
          <TD style={styles.cell}>{year.age}</TD>
          <TD style={styles.cell}>{formatCurrency(year.traditionalBalance)}</TD>
          <TD style={styles.cell}>{formatCurrency(year.rothBalance)}</TD>
          <TD style={styles.cell}>{formatCurrency(year.taxableBalance)}</TD>
          <TD style={styles.cell}>{formatCurrency(year.conversionAmount)}</TD>
          <TD style={styles.cell}>{formatCurrency(year.totalTax)}</TD>
          <TD style={styles.cell}>{formatCurrency(year.netWorth)}</TD>
        </TR>
      ))}
    </Table>
  );
}
```

### Anti-Patterns to Avoid
- **Direct Recharts in PDF:** react-pdf-charts does NOT support recharts v3+. Never try to use it with the project's recharts 3.6.0.
- **Client-side only PDF generation:** Using pdf().toBlob() in the browser can block the main thread for 5+ seconds on complex documents.
- **Edge runtime:** @react-pdf/renderer requires Node.js runtime, cannot use edge runtime.
- **Inline StyleSheet.create:** Define styles outside components to avoid recreation on each render.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Table borders | Manual View with borderWidth | @ag-media/react-pdf-table | Handles border collapse, alignment automatically |
| Page numbers | Manual counter state | render prop with pageNumber/totalPages | Built-in, handles multi-page wrapping |
| Currency formatting | Template strings | Intl.NumberFormat (same as existing formatCurrency) | Consistent with existing code |
| Chart rendering | Custom SVG parsing | html-to-image + Image component | SVG parsing for react-pdf is extremely complex |
| Page breaks | Manual page sizing | wrap prop on Page and View | react-pdf handles this automatically |

**Key insight:** React-pdf's component model looks like React but has critical differences - no CSS Grid, no table element, limited SVG support. Use dedicated libraries that understand these constraints.

## Common Pitfalls

### Pitfall 1: Recharts v3 + react-pdf-charts Incompatibility
**What goes wrong:** react-pdf-charts throws errors or renders blank charts
**Why it happens:** react-pdf-charts explicitly dropped support for recharts v3+ due to breaking changes
**How to avoid:** Use the hybrid approach - render charts on client, capture as PNG, embed as Image
**Warning signs:** Import errors, blank chart areas, "cannot read property" errors

### Pitfall 2: Next.js App Router SSR Errors
**What goes wrong:** "ba.Component is not a constructor" error in API routes
**Why it happens:** @react-pdf/renderer has issues with Next.js bundling in App Router
**How to avoid:** Add to next.config.ts: `serverExternalPackages: ['@react-pdf/renderer']`
**Warning signs:** Build errors, runtime errors in API routes only

### Pitfall 3: PDF Generation Timeout
**What goes wrong:** PDF generation exceeds 5-second requirement
**Why it happens:** Large year-by-year tables (40+ rows), multiple chart images, complex layouts
**How to avoid:**
  - Limit table rows to essential years (every 5 years for display)
  - Compress chart images before sending
  - Use streaming response if needed
**Warning signs:** Vercel function timeout, slow user experience

### Pitfall 4: Memory Issues with Chart Capture
**What goes wrong:** Browser becomes unresponsive during chart capture
**Why it happens:** html-to-image creates large canvases for high-DPI displays
**How to avoid:** Set explicit dimensions, use quality: 0.85 not 1.0, capture sequentially not in parallel
**Warning signs:** Browser tab freezing, mobile devices crashing

### Pitfall 5: Font Rendering Issues
**What goes wrong:** Wrong fonts in PDF, missing characters
**Why it happens:** react-pdf uses limited built-in fonts (Helvetica, Times, Courier)
**How to avoid:** Stick to built-in fonts for v1, or register custom fonts explicitly
**Warning signs:** Placeholder boxes, wrong font family in output

### Pitfall 6: Table Page Breaking
**What goes wrong:** Tables split mid-row across pages
**Why it happens:** @ag-media/react-pdf-table has known issues with multi-page tables
**How to avoid:** For year-by-year tables, either summarize to fit one page or manually paginate
**Warning signs:** Cut-off rows, overlapping content

## Code Examples

Verified patterns from official sources:

### Next.js Config for react-pdf
```typescript
// next.config.ts
// Source: https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@react-pdf/renderer'],
};

export default nextConfig;
```

### Main PDF Document Structure
```typescript
// lib/pdf/components/PDFDocument.tsx
// Source: https://react-pdf.org/components
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from '@react-pdf/renderer';
import { PDFHeader } from './PDFHeader';
import { PDFSummary } from './PDFSummary';
import { PDFStrategyTable } from './PDFStrategyTable';
import { PDFYearTable } from './PDFYearTable';
import { PDFFooter } from './PDFFooter';

const styles = StyleSheet.create({
  page: {
    padding: 40,
    paddingBottom: 80, // Space for fixed footer
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  section: {
    marginBottom: 15,
  },
  chartImage: {
    width: '100%',
    height: 200,
    objectFit: 'contain',
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
  },
});

interface PDFDocumentProps {
  clientName: string;
  data: ProjectionData;
  chartImages: {
    wealth?: string;
    breakeven?: string;
    sensitivity?: string;
  };
  generatedAt: string;
}

export function PDFDocument({
  clientName,
  data,
  chartImages,
  generatedAt,
}: PDFDocumentProps) {
  return (
    <Document
      title={`Roth Conversion Analysis - ${clientName}`}
      author="Rothc"
      subject="Roth Conversion Strategy Report"
    >
      {/* Page 1: Summary */}
      <Page size="A4" style={styles.page}>
        <PDFHeader clientName={clientName} generatedAt={generatedAt} />

        <View style={styles.section}>
          <Text style={styles.title}>Executive Summary</Text>
          <PDFSummary metrics={data.metrics} />
        </View>

        {chartImages.wealth && (
          <View style={styles.section}>
            <Text style={styles.title}>Wealth Projection</Text>
            <Image src={chartImages.wealth} style={styles.chartImage} />
          </View>
        )}

        <PDFFooter />
      </Page>

      {/* Page 2: Strategy Comparison */}
      <Page size="A4" style={styles.page}>
        <View style={styles.section}>
          <Text style={styles.title}>Strategy Comparison</Text>
          <PDFStrategyTable result={data.multiStrategy} />
        </View>

        {chartImages.breakeven && (
          <View style={styles.section}>
            <Text style={styles.title}>Breakeven Analysis</Text>
            <Image src={chartImages.breakeven} style={styles.chartImage} />
          </View>
        )}

        <PDFFooter />
      </Page>

      {/* Page 3: Year-by-Year (Summarized) */}
      <Page size="A4" style={styles.page} orientation="landscape">
        <View style={styles.section}>
          <Text style={styles.title}>Year-by-Year Projection (Key Milestones)</Text>
          <PDFYearTable years={data.keyYears} />
        </View>

        <PDFFooter />
      </Page>
    </Document>
  );
}
```

### Chart Capture Hook
```typescript
// hooks/use-pdf-export.ts
// Source: https://www.npmjs.com/package/html-to-image
'use client';

import { useState, RefObject } from 'react';
import { toPng } from 'html-to-image';

interface ChartRefs {
  wealth: RefObject<HTMLDivElement>;
  breakeven: RefObject<HTMLDivElement>;
  sensitivity?: RefObject<HTMLDivElement>;
}

export function usePDFExport(clientId: string) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const captureChart = async (
    ref: RefObject<HTMLDivElement>
  ): Promise<string | null> => {
    if (!ref.current) return null;

    try {
      // Wait for any animations to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const dataUrl = await toPng(ref.current, {
        quality: 0.85,
        pixelRatio: 2, // Good balance of quality/size
        backgroundColor: '#ffffff',
      });
      return dataUrl;
    } catch (err) {
      console.error('Failed to capture chart:', err);
      return null;
    }
  };

  const generatePDF = async (chartRefs: ChartRefs) => {
    setIsGenerating(true);
    setError(null);

    try {
      // Capture charts sequentially to avoid memory issues
      const wealthImage = await captureChart(chartRefs.wealth);
      const breakevenImage = await captureChart(chartRefs.breakeven);
      const sensitivityImage = chartRefs.sensitivity
        ? await captureChart(chartRefs.sensitivity)
        : null;

      const response = await fetch(`/api/pdf/${clientId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chartImages: {
            wealth: wealthImage,
            breakeven: breakevenImage,
            sensitivity: sensitivityImage,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('PDF generation failed');
      }

      const blob = await response.blob();

      // Trigger download
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `roth-analysis-${clientId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsGenerating(false);
    }
  };

  return { generatePDF, isGenerating, error };
}
```

### Strategy Comparison Table for PDF
```typescript
// lib/pdf/components/PDFStrategyTable.tsx
import { Table, TR, TH, TD } from '@ag-media/react-pdf-table';
import { Text, StyleSheet } from '@react-pdf/renderer';
import type { MultiStrategyResult, StrategyType } from '@/lib/calculations/types';
import { STRATEGY_DEFINITIONS, STRATEGIES } from '@/lib/calculations/strategy-definitions';

const styles = StyleSheet.create({
  headerCell: {
    backgroundColor: '#f3f4f6',
    padding: 6,
    fontSize: 8,
    fontWeight: 'bold',
  },
  bestHeader: {
    backgroundColor: '#dbeafe', // blue-100
  },
  cell: {
    padding: 6,
    fontSize: 8,
    textAlign: 'center',
  },
  bestCell: {
    backgroundColor: '#eff6ff', // blue-50
  },
  metricLabel: {
    textAlign: 'left',
    fontWeight: 'bold',
  },
  positive: {
    color: '#16a34a', // green-600
  },
});

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

interface PDFStrategyTableProps {
  result: MultiStrategyResult;
}

export function PDFStrategyTable({ result }: PDFStrategyTableProps) {
  const { bestStrategy, comparisonMetrics } = result;

  // 5 columns: metric label + 4 strategies
  const weightings = [0.24, 0.19, 0.19, 0.19, 0.19];

  return (
    <Table weightings={weightings}>
      <TH>
        <TD style={styles.headerCell}>Metric</TD>
        {STRATEGIES.map(strategy => (
          <TD
            key={strategy}
            style={[
              styles.headerCell,
              strategy === bestStrategy && styles.bestHeader,
            ]}
          >
            <Text>{STRATEGY_DEFINITIONS[strategy].name}</Text>
            {strategy === bestStrategy && (
              <Text style={{ fontSize: 6, marginTop: 2 }}>BEST</Text>
            )}
          </TD>
        ))}
      </TH>

      {/* Ending Wealth */}
      <TR>
        <TD style={[styles.cell, styles.metricLabel]}>Ending Wealth</TD>
        {STRATEGIES.map(strategy => (
          <TD
            key={strategy}
            style={[
              styles.cell,
              strategy === bestStrategy && styles.bestCell,
            ]}
          >
            {formatCurrency(comparisonMetrics[strategy].endingWealth)}
          </TD>
        ))}
      </TR>

      {/* Tax Savings */}
      <TR>
        <TD style={[styles.cell, styles.metricLabel]}>Tax Savings</TD>
        {STRATEGIES.map(strategy => (
          <TD
            key={strategy}
            style={[
              styles.cell,
              strategy === bestStrategy && styles.bestCell,
              comparisonMetrics[strategy].taxSavings > 0 && styles.positive,
            ]}
          >
            {comparisonMetrics[strategy].taxSavings > 0 ? '+' : ''}
            {formatCurrency(comparisonMetrics[strategy].taxSavings)}
          </TD>
        ))}
      </TR>

      {/* Breakeven Age */}
      <TR>
        <TD style={[styles.cell, styles.metricLabel]}>Breakeven Age</TD>
        {STRATEGIES.map(strategy => (
          <TD
            key={strategy}
            style={[
              styles.cell,
              strategy === bestStrategy && styles.bestCell,
            ]}
          >
            {comparisonMetrics[strategy].breakEvenAge ?? 'N/A'}
          </TD>
        ))}
      </TR>

      {/* IRMAA Surcharges */}
      <TR>
        <TD style={[styles.cell, styles.metricLabel]}>IRMAA Surcharges</TD>
        {STRATEGIES.map(strategy => (
          <TD
            key={strategy}
            style={[
              styles.cell,
              strategy === bestStrategy && styles.bestCell,
            ]}
          >
            {formatCurrency(comparisonMetrics[strategy].totalIRMAA)}
          </TD>
        ))}
      </TR>

      {/* Heir Benefit */}
      <TR>
        <TD style={[styles.cell, styles.metricLabel]}>Heir Benefit</TD>
        {STRATEGIES.map(strategy => (
          <TD
            key={strategy}
            style={[
              styles.cell,
              strategy === bestStrategy && styles.bestCell,
              comparisonMetrics[strategy].heirBenefit > 0 && styles.positive,
            ]}
          >
            {comparisonMetrics[strategy].heirBenefit > 0 ? '+' : ''}
            {formatCurrency(comparisonMetrics[strategy].heirBenefit)}
          </TD>
        ))}
      </TR>
    </Table>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| serverComponentsExternalPackages (experimental) | serverExternalPackages (stable) | Next.js 15 | Config key renamed |
| recharts + react-pdf-charts | recharts + html-to-image | recharts v3 (2024) | Direct SVG integration broken |
| Client-side pdf().toBlob() | Server-side API route | 2024 | Better performance, avoids blocking |
| Manual table Views | @ag-media/react-pdf-table | 2023 | Simpler table creation |

**Deprecated/outdated:**
- react-pdf-charts with recharts v3+: Library explicitly does not support v3
- serverComponentsExternalPackages: Renamed in Next.js 15

## Open Questions

Things that couldn't be fully resolved:

1. **Performance with Large Year Tables**
   - What we know: 40+ year projections may cause slow generation
   - What's unclear: Exact threshold before 5-second limit is hit
   - Recommendation: Implement with summarized view first (every 5 years), add full table as optional

2. **Custom Font Requirements**
   - What we know: Default Helvetica works, custom fonts need explicit registration
   - What's unclear: Whether client branding requires specific fonts
   - Recommendation: Use defaults for v1, plan font registration if needed later

3. **Chart Image Quality vs Size Trade-off**
   - What we know: pixelRatio: 2 with quality: 0.85 is reasonable balance
   - What's unclear: Optimal settings for Vercel function payload limits
   - Recommendation: Test with actual data, adjust if needed

## Sources

### Primary (HIGH confidence)
- [react-pdf.org/components](https://react-pdf.org/components) - Component API reference
- [react-pdf.org/styling](https://react-pdf.org/styling) - Styling documentation
- [react-pdf.org/advanced](https://react-pdf.org/advanced) - Fixed elements, render prop
- [nextjs.org/docs serverExternalPackages](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages) - Next.js 15 config

### Secondary (MEDIUM confidence)
- [GitHub: ag-media/react-pdf-table](https://github.com/ag-media/react-pdf-table) - Table component docs
- [npm: html-to-image](https://www.npmjs.com/package/html-to-image) - Chart capture library
- [GitHub gist: kidroca](https://gist.github.com/kidroca/19e5fe2de8e24aa92a41e94f2d41eda4) - SVG to PDF conversion approach
- [GitHub: react-pdf-charts limitations](https://github.com/EvHaus/react-pdf-charts) - recharts v3 incompatibility confirmed

### Tertiary (LOW confidence)
- Various Medium articles on PDF generation patterns - verify with official docs
- Stack Overflow answers on Next.js PDF issues - solutions may be version-specific

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - @react-pdf/renderer is standard, but recharts v3 workaround is less proven
- Architecture: MEDIUM - Hybrid approach is recommended but requires more client-side complexity
- Pitfalls: HIGH - Well-documented issues with Next.js App Router and recharts v3

**Research date:** 2026-01-18
**Valid until:** 2026-02-18 (30 days - react-pdf ecosystem is relatively stable)
