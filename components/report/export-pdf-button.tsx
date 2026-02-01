'use client';

import { useState, RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2, AlertCircle, FileText } from 'lucide-react';
import { captureChartAsBase64 } from '@/lib/utils/captureChart';
import { Client } from '@/lib/types/client';
import { Projection } from '@/lib/types/projection';

/**
 * Chart refs for capturing chart images
 */
export interface ReportChartRefs {
  lifetimeWealth: RefObject<HTMLDivElement | null>;
  conversion?: RefObject<HTMLDivElement | null>;
}

interface ExportPdfButtonProps {
  client: Client;
  projection: Projection;
  chartRefs: ReportChartRefs;
  variant?: 'default' | 'outline' | 'secondary';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
}

/**
 * Export PDF Button for the 13-page RothCheatCode Report
 *
 * Captures chart images and sends data to the PDF generation API.
 * Downloads the resulting PDF with a professional filename.
 */
export function ExportPdfButton({
  client,
  projection,
  chartRefs,
  variant = 'outline',
  size = 'default',
  className,
}: ExportPdfButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      // Capture charts as base64 images (sequentially to avoid memory issues)
      const lifetimeWealthChart = await captureChartAsBase64(chartRefs.lifetimeWealth, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        delay: 300, // Extra delay for chart animations
      });

      let conversionChart: string | null = null;
      if (chartRefs.conversion?.current) {
        conversionChart = await captureChartAsBase64(chartRefs.conversion, {
          quality: 0.95,
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          delay: 200,
        });
      }

      // Prepare report data
      const reportData = {
        client,
        projection,
      };

      // Call PDF generation API
      const response = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reportData,
          charts: {
            lifetimeWealth: lifetimeWealthChart,
            conversion: conversionChart,
          },
        }),
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

      // Create sanitized filename
      const sanitizedName = client.name
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 50);
      const timestamp = new Date().toISOString().split('T')[0];
      link.download = `RothCheatCode_${sanitizedName}_${timestamp}.pdf`;

      // Trigger download
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'PDF generation failed';
      setError(message);
      console.error('PDF export error:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={handleExport}
        disabled={isGenerating}
        variant={variant}
        size={size}
        className={className}
      >
        {isGenerating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generating PDF...
          </>
        ) : (
          <>
            <FileText className="mr-2 h-4 w-4" />
            Export Full Report
          </>
        )}
      </Button>

      {/* Inline error display */}
      {error && (
        <div className="flex items-center gap-1 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Compact version of the export button for tight layouts
 */
export function ExportPdfButtonCompact({
  client,
  projection,
  chartRefs,
}: Omit<ExportPdfButtonProps, 'variant' | 'size' | 'className'>) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleExport = async () => {
    setIsGenerating(true);

    try {
      const lifetimeWealthChart = await captureChartAsBase64(chartRefs.lifetimeWealth);
      const conversionChart = chartRefs.conversion?.current
        ? await captureChartAsBase64(chartRefs.conversion)
        : null;

      const response = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportData: { client, projection },
          charts: { lifetimeWealth: lifetimeWealthChart, conversion: conversionChart },
        }),
      });

      if (!response.ok) throw new Error('PDF generation failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `RothCheatCode_${client.name.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('PDF export error:', error);
      alert('Failed to export PDF. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={isGenerating}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#A0A0A0] bg-[#141414] hover:bg-[#1F1F1F] rounded border border-[#2A2A2A] transition-colors disabled:opacity-50"
      title="Export full 13-page PDF report"
    >
      {isGenerating ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Generating...</span>
        </>
      ) : (
        <>
          <Download className="h-3 w-3" />
          <span>PDF</span>
        </>
      )}
    </button>
  );
}
