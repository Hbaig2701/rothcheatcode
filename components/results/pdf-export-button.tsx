'use client';

import { Button } from '@/components/ui/button';
import { Download, Loader2, AlertCircle } from 'lucide-react';
import { usePDFExport, ChartRefs } from '@/hooks/use-pdf-export';

interface PDFExportButtonProps {
  clientId: string;
  clientName: string;
  chartRefs: ChartRefs;
}

/**
 * Download PDF button with loading state and error handling
 *
 * Captures chart images from DOM refs and sends to API for PDF generation.
 */
export function PDFExportButton({
  clientId,
  clientName,
  chartRefs,
}: PDFExportButtonProps) {
  const { generatePDF, isGenerating, error } = usePDFExport(clientId, clientName);

  const handleClick = () => {
    generatePDF(chartRefs);
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={handleClick}
        disabled={isGenerating}
        variant="outline"
        size="sm"
      >
        {isGenerating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Download className="mr-2 h-4 w-4" />
            Download PDF
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
