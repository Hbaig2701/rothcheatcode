/**
 * Audit harness — shared fixture factory + engine dispatcher.
 *
 * Why this exists:
 *   The standing audit suite (invariants / recompute / reconcile / edge /
 *   stress) needs to drive ALL THREE engines from concise fixtures. This
 *   module is the single source of truth for (a) a valid Client record and
 *   (b) which engine runs for a given blueprint_type — mirroring the
 *   production dispatch in app/api/clients/[id]/projections/route.ts so the
 *   harness exercises the same code paths advisors see.
 *
 * Units: everything in CENTS (engine native). Tax rates as whole percents.
 */

import type { Client } from '../../../types/client';
import type { SimulationInput, SimulationResult, YearlyResult } from '../../types';
import { runSimulation } from '../../engine';
import { runGrowthSimulation } from '../../growth-engine';
import { runGuaranteedIncomeSimulation } from '../../guaranteed-income/engine';
import { isGrowthProduct, isGuaranteedIncomeProduct } from '../../../config/products';

/**
 * Minimal client factory. Lists every field with a safe default so each
 * fixture states only what it varies. Defaults match report-fixtures.test.ts
 * (a known-valid single, age-65, TX, no-state-tax, optimized-conversion FIA).
 */
export function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'audit-fixture',
    user_id: 'audit-fixture',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    blueprint_type: 'fia',
    custom_product_id: null,
    scenario_name: null,
    filing_status: 'single',
    name: 'Audit Fixture',
    age: 65,
    spouse_name: null,
    spouse_age: null,
    qualified_account_value: 50_000_000,
    carrier_name: 'Test',
    product_name: 'Test',
    bonus_percent: 0,
    rate_of_return: 6,
    anniversary_bonus_percent: null,
    anniversary_bonus_years: null,
    state: 'TX',
    constraint_type: 'bracket_ceiling',
    tax_rate: 22,
    max_tax_rate: 24,
    tax_payment_source: 'from_taxable',
    state_tax_rate: null,
    gross_taxable_non_ssi: 0,
    tax_exempt_non_ssi: 0,
    ssi_payout_age: 67,
    ssi_annual_amount: 0,
    spouse_ssi_payout_age: null,
    spouse_ssi_annual_amount: null,
    non_ssi_income: [],
    withdrawals: [],
    conversion_type: 'optimized_amount',
    fixed_conversion_amount: null,
    target_partial_amount: null,
    respect_penalty_free_limit: false,
    protect_initial_premium: false,
    withdrawal_type: 'no_withdrawals',
    payout_type: 'individual',
    income_start_age: 67,
    guaranteed_rate_of_return: 6,
    roll_up_option: null,
    payout_option: null,
    gi_conversion_years: 5,
    gi_conversion_bracket: 24,
    surrender_years: 7,
    surrender_schedule: null,
    penalty_free_percent: 10,
    baseline_comparison_rate: 6,
    post_contract_rate: 5,
    years_to_defer_conversion: 0,
    end_age: 90,
    heir_tax_rate: 40,
    widow_analysis: false,
    widow_death_age: null,
    rmd_treatment: 'reinvested',
    aum_allocation_percent: 0,
    aum_fee_percent: 1,
    aum_dividend_yield: 2,
    aum_turnover_percent: 10,
    aum_withdrawal_years: 5,
    ltcg_rate: 15,
    date_of_birth: null,
    spouse_dob: null,
    life_expectancy: null,
    traditional_ira: 0,
    roth_ira: 0,
    taxable_accounts: 0,
    other_retirement: 0,
    federal_bracket: '22',
    include_niit: false,
    include_aca: false,
    ss_self: 0,
    ss_spouse: 0,
    pension: 0,
    other_income: 0,
    ss_start_age: 67,
    strategy: 'moderate',
    start_age: 65,
    growth_rate: 6,
    inflation_rate: 2.5,
    heir_bracket: '40',
    projection_years: 25,
    sensitivity: false,
    ...overrides,
  } as Client;
}

export type EngineName = 'standard' | 'growth' | 'gi';

/** Which engine the production route would pick for this client. */
export function engineFor(client: Client): EngineName {
  const t = client.blueprint_type;
  if (t && isGuaranteedIncomeProduct(t)) return 'gi';
  if (t && isGrowthProduct(t)) return 'growth';
  return 'standard';
}

export interface DispatchResult {
  engine: EngineName;
  client: Client;
  baseline: YearlyResult[];
  formula: YearlyResult[];
  result: SimulationResult;
}

/**
 * Run the correct engine for a client, mirroring the projections route's
 * dispatch. Returns baseline + strategy (formula) year arrays. Projection
 * horizon uses (end_age - age), inclusive, per createSimulationInput.
 */
export function dispatch(client: Client, startYear = 2026): DispatchResult {
  const projectionYears = client.end_age - client.age;
  const input: SimulationInput = {
    client,
    startYear,
    endYear: startYear + projectionYears - 1,
    customProduct: null,
  };
  const engine = engineFor(client);
  let result: SimulationResult;
  if (engine === 'gi') {
    result = runGuaranteedIncomeSimulation(input);
  } else if (engine === 'growth') {
    result = runGrowthSimulation(input);
  } else {
    result = runSimulation(input);
  }
  return {
    engine,
    client,
    baseline: result.baseline,
    formula: result.formula,
    result,
  };
}

/** Representative blueprint_type per engine, for golden masters + sweeps. */
export const SAMPLE_PRODUCTS: Record<EngineName, Client['blueprint_type']> = {
  standard: 'fia',
  growth: 'high-bonus-long-term-growth',
  gi: 'generic-income',
};
