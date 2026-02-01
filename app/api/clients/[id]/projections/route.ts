import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runSimulation, createSimulationInput, runGuaranteedIncomeSimulation } from '@/lib/calculations';
import type { Client } from '@/lib/types/client';
import type { ProjectionInsert, ProjectionResponse } from '@/lib/types/projection';
import type { SimulationResult } from '@/lib/calculations';
import type { GIMetrics } from '@/lib/calculations/guaranteed-income/types';
import { isGuaranteedIncomeProduct, type BlueprintType } from '@/lib/config/products';
import crypto from 'crypto';

function generateInputHash(client: Client): string {
  const relevantFields = {
    // New Blueprint fields
    age: client.age,
    qualified_account_value: client.qualified_account_value,
    carrier_name: client.carrier_name,
    product_name: client.product_name,
    bonus_percent: client.bonus_percent,
    rate_of_return: client.rate_of_return,
    constraint_type: client.constraint_type,
    tax_rate: client.tax_rate,
    max_tax_rate: client.max_tax_rate,
    ssi_payout_age: client.ssi_payout_age,
    ssi_annual_amount: client.ssi_annual_amount,
    non_ssi_income: client.non_ssi_income,
    conversion_type: client.conversion_type,
    protect_initial_premium: client.protect_initial_premium,
    withdrawal_type: client.withdrawal_type,
    surrender_years: client.surrender_years,
    penalty_free_percent: client.penalty_free_percent,
    baseline_comparison_rate: client.baseline_comparison_rate,
    post_contract_rate: client.post_contract_rate,
    years_to_defer_conversion: client.years_to_defer_conversion,
    heir_tax_rate: client.heir_tax_rate,
    // Legacy fields (kept for backwards compatibility)
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
    widow_analysis: client.widow_analysis,
    // GI-specific fields
    blueprint_type: client.blueprint_type,
    payout_type: client.payout_type,
    income_start_age: client.income_start_age,
    guaranteed_rate_of_return: client.guaranteed_rate_of_return,
  };
  return crypto.createHash('sha256').update(JSON.stringify(relevantFields)).digest('hex');
}

// Map conversion_type to strategy name for display
function getStrategyFromConversionType(conversionType?: string): string {
  switch (conversionType) {
    case 'optimized_amount': return 'moderate';
    case 'fixed_amount': return 'conservative';
    case 'full_conversion': return 'aggressive';
    case 'no_conversion': return 'conservative';
    default: return 'moderate';
  }
}

function simulationToProjection(
  clientId: string,
  userId: string,
  client: Client,
  result: SimulationResult,
  inputHash: string,
  giMetrics?: GIMetrics
): ProjectionInsert {
  const lastBaseline = result.baseline[result.baseline.length - 1];
  const lastBlueprint = result.blueprint[result.blueprint.length - 1];

  // Determine strategy from conversion_type or legacy strategy field
  const strategy = client.conversion_type
    ? getStrategyFromConversionType(client.conversion_type)
    : (client.strategy ?? 'moderate');

  // Calculate projection years from end_age - age or use legacy field
  const projectionYears = client.age && client.end_age
    ? client.end_age - client.age
    : (client.projection_years ?? 30);

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
    strategy,
    projection_years: projectionYears,
    // GI-specific metrics (null for Growth products)
    gi_annual_income_gross: giMetrics?.annualIncomeGross ?? null,
    gi_annual_income_net: giMetrics?.annualIncomeNet ?? null,
    gi_income_start_age: giMetrics?.incomeStartAge ?? null,
    gi_depletion_age: giMetrics?.depletionAge ?? null,
    gi_income_base_at_start: giMetrics?.incomeBaseAtStart ?? null,
    gi_income_base_at_income_age: giMetrics?.incomeBaseAtIncomeAge ?? null,
    gi_total_gross_paid: giMetrics?.totalGrossPaid ?? null,
    gi_total_net_paid: giMetrics?.totalNetPaid ?? null,
    gi_yearly_data: giMetrics?.yearlyData ?? null,
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

    // Run simulation - dispatch to GI or Growth engine based on product type
    const simulationInput = createSimulationInput(client as Client);
    const blueprintType = (client as Client).blueprint_type as BlueprintType;
    const isGI = blueprintType && isGuaranteedIncomeProduct(blueprintType);

    let projectionInsert: ProjectionInsert;
    if (isGI) {
      const giResult = runGuaranteedIncomeSimulation(simulationInput);
      projectionInsert = simulationToProjection(clientId, user.id, client as Client, giResult, inputHash, giResult.giMetrics);
    } else {
      const result = runSimulation(simulationInput);
      projectionInsert = simulationToProjection(clientId, user.id, client as Client, result, inputHash);
    }

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
    const blueprintType = (client as Client).blueprint_type as BlueprintType;
    const isGI = blueprintType && isGuaranteedIncomeProduct(blueprintType);

    let projectionInsert: ProjectionInsert;
    if (isGI) {
      const giResult = runGuaranteedIncomeSimulation(simulationInput);
      projectionInsert = simulationToProjection(clientId, user.id, client as Client, giResult, inputHash, giResult.giMetrics);
    } else {
      const result = runSimulation(simulationInput);
      projectionInsert = simulationToProjection(clientId, user.id, client as Client, result, inputHash);
    }

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
