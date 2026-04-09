import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Client } from '@/lib/types/client';
import { analyzeBreakEven } from '@/lib/calculations/analysis/breakeven';
import { runSensitivityAnalysis } from '@/lib/calculations/analysis/sensitivity';
import { analyzeWidowPenalty } from '@/lib/calculations/analysis/widow-penalty';
import { runSimulation, createSimulationInput, runGrowthSimulation, runGuaranteedIncomeSimulation } from '@/lib/calculations';
import { logCalculation } from '@/lib/audit/log';
import { isGuaranteedIncomeProduct, isGrowthProduct, type FormulaType } from '@/lib/config/products';
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

  // Dispatch to the correct engine based on product type so breakeven,
  // sensitivity and widow analysis all see the same numbers as the main
  // projection. Previously this always used runSimulation (legacy engine),
  // which produced misleading numbers for Growth FIA and GI products.
  const simulationInput = createSimulationInput(typedClient);
  const formulaType = typedClient.blueprint_type as FormulaType;
  const isGI = formulaType && isGuaranteedIncomeProduct(formulaType);
  const isGrowth = formulaType && isGrowthProduct(formulaType);

  const baseResult = isGI
    ? runGuaranteedIncomeSimulation(simulationInput)
    : isGrowth
      ? runGrowthSimulation(simulationInput)
      : runSimulation(simulationInput);

  const response: AnalysisResponse = {
    breakeven: null,
    sensitivity: null,
    widow: null,
  };

  // Breakeven analysis — operates on whichever engine's baseline/formula we ran
  response.breakeven = analyzeBreakEven(baseResult.baseline, baseResult.formula);

  // Run sensitivity analysis if enabled (legacy analyzer — known to use the
  // standard engine; accurate for legacy clients only)
  if (typedClient.sensitivity && !isGI && !isGrowth) {
    response.sensitivity = runSensitivityAnalysis(typedClient);
  }

  // Widow analysis: the analyzer uses the legacy baseline/widow scenarios,
  // which do NOT model Growth FIA product features (bonuses, surrender,
  // post-contract rate, principal protection) or GI income streams.
  // Running it for those products would show numbers inconsistent with the
  // main projection. Restrict to legacy/standard clients until the analyzer
  // is refactored to be engine-aware.
  if (
    typedClient.widow_analysis &&
    typedClient.filing_status === 'married_filing_jointly' &&
    !isGI &&
    !isGrowth
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
