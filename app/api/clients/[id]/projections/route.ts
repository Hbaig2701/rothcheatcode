import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runSimulation, createSimulationInput, runGuaranteedIncomeSimulation, runGrowthSimulation } from '@/lib/calculations';
import type { Client } from '@/lib/types/client';
import type { ProjectionInsert, ProjectionResponse } from '@/lib/types/projection';
import type { SimulationResult } from '@/lib/calculations';
import type { GIMetrics } from '@/lib/calculations/guaranteed-income/types';
import { isGuaranteedIncomeProduct, isGrowthProduct, type FormulaType } from '@/lib/config/products';
import crypto from 'crypto';

// Increment this when product configurations change (payout tables, roll-up rates, etc.)
// This ensures cached projections are invalidated when we update product data
const PRODUCT_CONFIG_VERSION = 8; // v8: Fix Growth FIA dispatch to use growth engine (anniversary bonus support)

function generateInputHash(client: Client): string {
  const relevantFields = {
    // Config version - bump this when product configs change
    _configVersion: PRODUCT_CONFIG_VERSION,
    // New Formula fields
    age: client.age,
    qualified_account_value: client.qualified_account_value,
    carrier_name: client.carrier_name,
    product_name: client.product_name,
    bonus_percent: client.bonus_percent,
    rate_of_return: client.rate_of_return,
    anniversary_bonus_percent: client.anniversary_bonus_percent,
    anniversary_bonus_years: client.anniversary_bonus_years,
    constraint_type: client.constraint_type,
    tax_rate: client.tax_rate,
    max_tax_rate: client.max_tax_rate,
    ssi_payout_age: client.ssi_payout_age,
    ssi_annual_amount: client.ssi_annual_amount,
    spouse_age: client.spouse_age,
    spouse_ssi_payout_age: client.spouse_ssi_payout_age,
    spouse_ssi_annual_amount: client.spouse_ssi_annual_amount,
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
    rmd_treatment: client.rmd_treatment,
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
    roll_up_option: client.roll_up_option,
    payout_option: client.payout_option,
    // GI 4-phase model fields
    gi_conversion_years: client.gi_conversion_years,
    gi_conversion_bracket: client.gi_conversion_bracket,
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
  const lastFormula = result.formula[result.formula.length - 1];

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
    blueprint_final_traditional: lastFormula.traditionalBalance,
    blueprint_final_roth: lastFormula.rothBalance,
    blueprint_final_taxable: lastFormula.taxableBalance,
    blueprint_final_net_worth: lastFormula.netWorth,
    baseline_years: result.baseline,
    blueprint_years: result.formula,
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
    gi_total_rider_fees: giMetrics?.totalRiderFees ?? null,
    gi_payout_percent: giMetrics?.payoutPercent ?? null,
    gi_roll_up_description: giMetrics?.rollUpDescription ?? null,
    // GI 4-phase model fields
    gi_conversion_phase_years: giMetrics?.conversionPhaseYears ?? null,
    gi_purchase_age: giMetrics?.purchaseAge ?? null,
    gi_purchase_amount: giMetrics?.purchaseAmount ?? null,
    gi_total_conversion_tax: giMetrics?.totalConversionTax ?? null,
    gi_deferral_years: giMetrics?.deferralYears ?? null,
    // GI comparison metrics
    gi_strategy_annual_income_net: giMetrics?.comparison?.strategyAnnualIncomeNet ?? null,
    gi_baseline_annual_income_gross: giMetrics?.comparison?.baselineAnnualIncomeGross ?? null,
    gi_baseline_annual_income_net: giMetrics?.comparison?.baselineAnnualIncomeNet ?? null,
    gi_baseline_annual_tax: giMetrics?.comparison?.baselineAnnualTax ?? null,
    gi_baseline_income_base: giMetrics?.comparison?.baselineIncomeBase ?? null,
    gi_annual_income_advantage: giMetrics?.comparison?.annualIncomeAdvantage ?? null,
    gi_lifetime_income_advantage: giMetrics?.comparison?.lifetimeIncomeAdvantage ?? null,
    gi_tax_free_wealth_created: giMetrics?.comparison?.taxFreeWealthCreated ?? null,
    gi_break_even_years: giMetrics?.comparison?.breakEvenYears ?? null,
    gi_break_even_age: giMetrics?.comparison?.breakEvenAge ?? null,
    gi_percent_improvement: giMetrics?.comparison?.percentImprovement ?? null,
    gi_baseline_yearly_data: giMetrics?.baselineYearlyData ?? null,
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

    // Run simulation - dispatch to GI or standard engine based on product type
    const simulationInput = createSimulationInput(client as Client);
    const formulaType = (client as Client).blueprint_type as FormulaType;
    const isGI = formulaType && isGuaranteedIncomeProduct(formulaType);
    const isGrowth = formulaType && isGrowthProduct(formulaType);

    console.log('[PROJECTION DEBUG] formulaType:', formulaType, 'isGI:', isGI, 'isGrowth:', isGrowth);
    console.log('[PROJECTION DEBUG] anniversary_bonus_percent:', (client as Client).anniversary_bonus_percent, 'anniversary_bonus_years:', (client as Client).anniversary_bonus_years);

    let projectionInsert: ProjectionInsert;
    if (isGI) {
      console.log('[PROJECTION DEBUG] Using GI engine');
      const giResult = runGuaranteedIncomeSimulation(simulationInput);
      projectionInsert = simulationToProjection(clientId, user.id, client as Client, giResult, inputHash, giResult.giMetrics);
    } else if (isGrowth) {
      console.log('[PROJECTION DEBUG] Using GROWTH engine');
      const result = runGrowthSimulation(simulationInput);
      console.log('[PROJECTION DEBUG] Growth result year 1 trad:', result.formula[0]?.traditionalBalance);
      projectionInsert = simulationToProjection(clientId, user.id, client as Client, result, inputHash);
    } else {
      console.log('[PROJECTION DEBUG] Using LEGACY engine');
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
    const formulaType = (client as Client).blueprint_type as FormulaType;
    const isGI = formulaType && isGuaranteedIncomeProduct(formulaType);

    let projectionInsert: ProjectionInsert;
    if (isGI) {
      const giResult = runGuaranteedIncomeSimulation(simulationInput);
      projectionInsert = simulationToProjection(clientId, user.id, client as Client, giResult, inputHash, giResult.giMetrics);
    } else if (isGrowthProduct(formulaType)) {
      // Growth FIA: uses growth engine with anniversary bonus support
      const result = runGrowthSimulation(simulationInput);
      projectionInsert = simulationToProjection(clientId, user.id, client as Client, result, inputHash);
    } else {
      // Legacy: use standard simulation
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
