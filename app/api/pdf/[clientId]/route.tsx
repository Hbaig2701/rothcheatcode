import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { PDFDataProps, ChartImages, SummaryMetrics, PDFBranding } from '@/lib/pdf/types';
import { runMultiStrategySimulation } from '@/lib/calculations/multi-strategy';
import type { Client } from '@/lib/types/client';
import type { MultiStrategyResult, YearlyResult } from '@/lib/calculations/types';

// Route segment config
export const dynamic = 'force-dynamic';
export const maxDuration = 10; // 10 second timeout for Vercel

// Dynamic imports to avoid build-time bundling issues with react-pdf
// The library uses React.createContext which causes issues during Next.js page data collection
async function generatePDFBuffer(
  clientName: string,
  generatedAt: string,
  data: PDFDataProps,
  chartImages?: ChartImages,
  branding?: PDFBranding
): Promise<Uint8Array> {
  // Dynamic import at runtime to avoid build issues
  const { renderToBuffer } = await import('@react-pdf/renderer');
  const { PDFDocument } = await import('@/lib/pdf');

  const buffer = await renderToBuffer(
    <PDFDocument
      clientName={clientName}
      generatedAt={generatedAt}
      data={data}
      chartImages={chartImages}
      branding={branding}
    />
  );

  return new Uint8Array(buffer);
}

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
  const formulaYears = bestResult.formula;
  const keyYears: YearlyResult[] = [];

  if (formulaYears.length > 0) {
    // Always include first year
    keyYears.push(formulaYears[0]);

    // Add every 5th year (by age)
    const startAge = formulaYears[0].age;
    for (let i = 1; i < formulaYears.length - 1; i++) {
      const yearData = formulaYears[i];
      if ((yearData.age - startAge) % 5 === 0) {
        keyYears.push(yearData);
      }
    }

    // Always include last year
    const lastYear = formulaYears[formulaYears.length - 1];
    if (keyYears[keyYears.length - 1]?.year !== lastYear.year) {
      keyYears.push(lastYear);
    }
  }

  return {
    metrics: summaryMetrics,
    multiStrategy: result,
    bestStrategy,
    baselineYears: bestResult.baseline,
    formulaYears: bestResult.formula,
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

    // Fetch user settings for PDF branding
    let branding: PDFBranding | undefined;
    const { data: settings } = await supabase
      .from('user_settings')
      .select('company_name, tagline, company_phone, company_email, company_website, address, logo_url, primary_color, secondary_color')
      .eq('user_id', user.id)
      .single();

    if (settings) {
      branding = {
        logoUrl: settings.logo_url,
        companyName: settings.company_name,
        tagline: settings.tagline,
        phone: settings.company_phone,
        email: settings.company_email,
        website: settings.company_website,
        address: settings.address,
        primaryColor: settings.primary_color || '#1e3a5f',
        secondaryColor: settings.secondary_color || '#14b8a6',
      };
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

    // Generate PDF buffer using dynamic imports
    const uint8Array = await generatePDFBuffer(
      client.name,
      new Date().toISOString(),
      pdfData,
      chartImages,
      branding
    );

    // Prepare filename
    const sanitizedName = sanitizeFilename(client.name);
    const filename = `roth-analysis-${sanitizedName}.pdf`;

    // Return PDF response
    // Cast to unknown first to satisfy TypeScript's strict type checking
    return new Response(uint8Array as unknown as BodyInit, {
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
