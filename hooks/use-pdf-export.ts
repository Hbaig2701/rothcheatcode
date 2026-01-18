'use client';

import { useState, RefObject, useCallback } from 'react';
import { toPng } from 'html-to-image';

/**
 * Refs to chart container divs for image capture
 * All refs are optional since not all charts may be rendered
 */
export interface ChartRefs {
  wealth: RefObject<HTMLDivElement | null>;
  breakeven?: RefObject<HTMLDivElement | null>;
  sensitivity?: RefObject<HTMLDivElement | null>;
}

/**
 * Return type for usePDFExport hook
 */
interface UsePDFExportReturn {
  generatePDF: (chartRefs: ChartRefs) => Promise<void>;
  isGenerating: boolean;
  error: string | null;
}

/**
 * Capture a chart element as PNG base64 string
 * Waits briefly for animations to complete
 */
async function captureChart(
  ref: RefObject<HTMLDivElement | null>
): Promise<string | null> {
  if (!ref.current) {
    return null;
  }

  try {
    // Wait for animations to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    const dataUrl = await toPng(ref.current, {
      quality: 0.85,
      pixelRatio: 2, // Higher resolution for PDF
      backgroundColor: '#ffffff',
      cacheBust: true,
    });

    return dataUrl;
  } catch (error) {
    console.error('Chart capture error:', error);
    return null;
  }
}

/**
 * Hook for generating and downloading PDF reports
 *
 * Usage:
 * ```tsx
 * const { generatePDF, isGenerating, error } = usePDFExport(clientId, clientName);
 *
 * // When button clicked:
 * generatePDF({ wealth: wealthChartRef, breakeven: breakevenChartRef });
 * ```
 */
export function usePDFExport(
  clientId: string,
  clientName: string
): UsePDFExportReturn {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generatePDF = useCallback(async (chartRefs: ChartRefs) => {
    setIsGenerating(true);
    setError(null);

    try {
      // Capture charts SEQUENTIALLY to avoid memory issues
      // Parallel capture can overwhelm the browser on complex charts
      const wealthImage = await captureChart(chartRefs.wealth);
      const breakevenImage = chartRefs.breakeven
        ? await captureChart(chartRefs.breakeven)
        : null;
      const sensitivityImage = chartRefs.sensitivity
        ? await captureChart(chartRefs.sensitivity)
        : null;

      // Prepare chart images payload
      const chartImages: Record<string, string | undefined> = {};
      if (wealthImage) chartImages.wealth = wealthImage;
      if (breakevenImage) chartImages.breakeven = breakevenImage;
      if (sensitivityImage) chartImages.sensitivity = sensitivityImage;

      // Call PDF generation API
      const response = await fetch(`/api/pdf/${clientId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ chartImages }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate PDF');
      }

      // Get PDF blob
      const blob = await response.blob();

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Sanitize filename
      const sanitizedName = clientName
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .toLowerCase()
        .slice(0, 50);
      link.download = `roth-analysis-${sanitizedName}.pdf`;

      // Trigger download
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setIsGenerating(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'PDF generation failed';
      setError(message);
      setIsGenerating(false);
      console.error('PDF export error:', err);
    }
  }, [clientId, clientName]);

  return { generatePDF, isGenerating, error };
}
