import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Client } from '@/lib/types/client';
import { analyzeBreakEven } from '@/lib/calculations/analysis/breakeven';
import { runSensitivityAnalysis } from '@/lib/calculations/analysis/sensitivity';
import { analyzeWidowPenalty } from '@/lib/calculations/analysis/widow-penalty';
import { runSimulation, createSimulationInput } from '@/lib/calculations/engine';
import { logCalculation } from '@/lib/audit/log';
import type { BreakEvenAnalysis, SensitivityResult, WidowAnalysisResult } from '@/lib/calculations/analysis/types';

interface AnalysisResponse {
  breakeven: BreakEvenAnalysis | null;
  sensitivity: SensitivityResult | null;
  widow: WidowAnalysisResult | null;
}

/**
 * GET /api/clients/[id]/analysis
 * Returns advanced analysis results for a client
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const supabase = await createClient();

  // Verify authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch client
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single();

  if (clientError) {
    if (clientError.code === 'PGRST116') {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }
    return NextResponse.json({ error: clientError.message }, { status: 500 });
  }

  const typedClient = client as Client;

  // Track calculation time for audit
  const startTime = performance.now();

  // Run base simulation for breakeven analysis
  const simulationInput = createSimulationInput(typedClient);
  const baseResult = runSimulation(simulationInput);

  const response: AnalysisResponse = {
    breakeven: null,
    sensitivity: null,
    widow: null,
  };

  // Always compute breakeven analysis
  response.breakeven = analyzeBreakEven(baseResult.baseline, baseResult.formula);

  // Run sensitivity analysis if enabled
  if (typedClient.sensitivity) {
    response.sensitivity = runSensitivityAnalysis(typedClient);
  }

  // Run widow analysis if enabled and married
  if (
    typedClient.widow_analysis &&
    typedClient.filing_status === 'married_filing_jointly'
  ) {
    try {
      response.widow = analyzeWidowPenalty(typedClient);
    } catch (err) {
      console.error('[Analysis] Widow analysis error:', err);
      // Don't fail the whole request, just return null
    }
  }

  // Calculate duration and log to audit
  const durationMs = performance.now() - startTime;
  logCalculation(supabase, typedClient, baseResult, durationMs);

  return NextResponse.json(response);
}
