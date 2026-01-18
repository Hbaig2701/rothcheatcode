import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runSimulation, createSimulationInput } from '@/lib/calculations';
import type { Client } from '@/lib/types/client';
import type { ProjectionInsert, ProjectionResponse } from '@/lib/types/projection';
import type { SimulationResult } from '@/lib/calculations';
import crypto from 'crypto';

function generateInputHash(client: Client): string {
  const relevantFields = {
    traditional_ira: client.traditional_ira,
    roth_ira: client.roth_ira,
    taxable_accounts: client.taxable_accounts,
    date_of_birth: client.date_of_birth,
    spouse_dob: client.spouse_dob,
    filing_status: client.filing_status,
    state: client.state,
    strategy: client.strategy,
    start_age: client.start_age,
    end_age: client.end_age,
    growth_rate: client.growth_rate,
    inflation_rate: client.inflation_rate,
    projection_years: client.projection_years,
    ss_self: client.ss_self,
    ss_spouse: client.ss_spouse,
    pension: client.pension,
    other_income: client.other_income,
  };
  return crypto.createHash('sha256').update(JSON.stringify(relevantFields)).digest('hex');
}

function simulationToProjection(
  clientId: string,
  userId: string,
  client: Client,
  result: SimulationResult,
  inputHash: string
): ProjectionInsert {
  const lastBaseline = result.baseline[result.baseline.length - 1];
  const lastBlueprint = result.blueprint[result.blueprint.length - 1];

  return {
    client_id: clientId,
    user_id: userId,
    input_hash: inputHash,
    break_even_age: result.breakEvenAge,
    total_tax_savings: result.totalTaxSavings,
    heir_benefit: result.heirBenefit,
    baseline_final_traditional: lastBaseline.traditionalBalance,
    baseline_final_roth: lastBaseline.rothBalance,
    baseline_final_taxable: lastBaseline.taxableBalance,
    baseline_final_net_worth: lastBaseline.netWorth,
    blueprint_final_traditional: lastBlueprint.traditionalBalance,
    blueprint_final_roth: lastBlueprint.rothBalance,
    blueprint_final_taxable: lastBlueprint.taxableBalance,
    blueprint_final_net_worth: lastBlueprint.netWorth,
    baseline_years: result.baseline,
    blueprint_years: result.blueprint,
    strategy: client.strategy ?? 'moderate',
    projection_years: client.projection_years ?? 30
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await context.params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();

    if (clientError) {
      if (clientError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 });
      }
      throw clientError;
    }

    const inputHash = generateInputHash(client as Client);

    // Check cache
    const { data: existingProjection } = await supabase
      .from('projections')
      .select('*')
      .eq('client_id', clientId)
      .eq('input_hash', inputHash)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existingProjection) {
      return NextResponse.json({ projection: existingProjection, cached: true } as ProjectionResponse);
    }

    // Run simulation
    const simulationInput = createSimulationInput(client as Client);
    const result = runSimulation(simulationInput);

    const projectionInsert = simulationToProjection(clientId, user.id, client as Client, result, inputHash);

    const { data: newProjection, error: insertError } = await supabase
      .from('projections')
      .insert(projectionInsert)
      .select()
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({ projection: newProjection, cached: false } as ProjectionResponse);
  } catch (error) {
    console.error('Projection error:', error);
    return NextResponse.json({ error: 'Failed to generate projection' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await context.params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();

    if (clientError) {
      if (clientError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 });
      }
      throw clientError;
    }

    const inputHash = generateInputHash(client as Client);
    const simulationInput = createSimulationInput(client as Client);
    const result = runSimulation(simulationInput);

    const projectionInsert = simulationToProjection(clientId, user.id, client as Client, result, inputHash);

    const { data: newProjection, error: insertError } = await supabase
      .from('projections')
      .insert(projectionInsert)
      .select()
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({ projection: newProjection, cached: false } as ProjectionResponse);
  } catch (error) {
    console.error('Projection error:', error);
    return NextResponse.json({ error: 'Failed to generate projection' }, { status: 500 });
  }
}
