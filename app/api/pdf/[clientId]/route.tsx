import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { PDFDocument } from '@/lib/pdf';
import type { PDFDataProps, ChartImages, SummaryMetrics } from '@/lib/pdf/types';
import { runMultiStrategySimulation } from '@/lib/calculations/multi-strategy';
import type { Client } from '@/lib/types/client';
import type { MultiStrategyResult, YearlyResult } from '@/lib/calculations/types';

// Route segment config
export const dynamic = 'force-dynamic';
export const maxDuration = 10; // 10 second timeout for Vercel

type RouteContext = { params: Promise<{ clientId: string }> };

/**
 * Transform simulation result into PDF data format
 */
function transformToPDFData(
  result: MultiStrategyResult,
  bestStrategy: MultiStrategyResult['bestStrategy']
): PDFDataProps {
  const bestResult = result.strategies[bestStrategy];
  const metrics = result.comparisonMetrics[bestStrategy];

  // Extract summary metrics
  const summaryMetrics: SummaryMetrics = {
    endingWealth: metrics.endingWealth,
    taxSavings: metrics.taxSavings,
    breakEvenAge: metrics.breakEvenAge,
    totalIRMAA: metrics.totalIRMAA,
    heirBenefit: metrics.heirBenefit,
  };

  // Get key years (every 5 years + first + last)
  const blueprintYears = bestResult.blueprint;
  const keyYears: YearlyResult[] = [];

  if (blueprintYears.length > 0) {
    // Always include first year
    keyYears.push(blueprintYears[0]);

    // Add every 5th year (by age)
    const startAge = blueprintYears[0].age;
    for (let i = 1; i < blueprintYears.length - 1; i++) {
      const yearData = blueprintYears[i];
      if ((yearData.age - startAge) % 5 === 0) {
        keyYears.push(yearData);
      }
    }

    // Always include last year
    const lastYear = blueprintYears[blueprintYears.length - 1];
    if (keyYears[keyYears.length - 1]?.year !== lastYear.year) {
      keyYears.push(lastYear);
    }
  }

  return {
    metrics: summaryMetrics,
    multiStrategy: result,
    bestStrategy,
    baselineYears: bestResult.baseline,
    blueprintYears: bestResult.blueprint,
    keyYears,
  };
}

/**
 * Sanitize filename for Content-Disposition header
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .toLowerCase()
    .slice(0, 50); // Limit length
}

export async function POST(request: Request, context: RouteContext) {
  const { clientId } = await context.params;
  const supabase = await createClient();

  try {
    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body for chart images
    let chartImages: ChartImages | undefined;
    try {
      const body = await request.json();
      chartImages = body.chartImages;
    } catch {
      // Body parsing failed, continue without chart images
    }

    // Fetch client data
    const { data: client, error: fetchError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();

    if (fetchError || !client) {
      const status = fetchError?.code === 'PGRST116' ? 404 : 500;
      return NextResponse.json(
        { error: status === 404 ? 'Client not found' : 'Failed to fetch client' },
        { status }
      );
    }

    // Run multi-strategy simulation
    const currentYear = new Date().getFullYear();
    const projectionYears = client.projection_years || 40;

    const result = runMultiStrategySimulation(
      client as Client,
      currentYear,
      currentYear + projectionYears
    );

    // Transform to PDF data format
    const pdfData = transformToPDFData(result, result.bestStrategy);

    // Generate PDF buffer
    const buffer = await renderToBuffer(
      <PDFDocument
        clientName={client.name}
        generatedAt={new Date().toISOString()}
        data={pdfData}
        chartImages={chartImages}
      />
    );

    // Prepare filename
    const sanitizedName = sanitizeFilename(client.name);
    const filename = `roth-analysis-${sanitizedName}.pdf`;

    // Convert Buffer to Uint8Array for Response compatibility
    const uint8Array = new Uint8Array(buffer);

    // Return PDF response
    return new Response(uint8Array, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}
