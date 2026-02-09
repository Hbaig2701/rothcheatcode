import type { YearlyResult } from '@/lib/calculations';

/**
 * GI phase type for 4-phase model
 */
export type GIPhase = 'conversion' | 'purchase' | 'deferral' | 'income';

/**
 * GI year-by-year tracking data (stored as JSONB)
 */
export interface GIYearlyData {
  year: number;
  age: number;
  phase: GIPhase;

  // Conversion phase data
  traditionalBalance: number;       // Traditional IRA balance (cents)
  rothBalance: number;              // Roth IRA balance (cents)
  conversionAmount: number;         // Amount converted this year (cents)
  conversionTax: number;            // Tax paid on conversion (cents)

  // GI-specific (deferral + income phases)
  accountValue: number;             // GI Account Value (cents)
  incomeBase: number;               // GI Income Base (cents)
  guaranteedIncomeGross: number;    // Annual GI payment (cents, 0 during non-income phases)
  guaranteedIncomeNet: number;      // After-tax GI (cents, 0 during non-income phases)
  riderFee: number;                 // Annual rider fee deducted (cents)
  cumulativeIncome: number;         // Running total of net income received (cents)
}

/**
 * Projection record from database
 */
export interface Projection {
  id: string;
  client_id: string;
  user_id: string;
  created_at: string;
  input_hash: string;

  break_even_age: number | null;
  total_tax_savings: number;
  heir_benefit: number;

  baseline_final_traditional: number;
  baseline_final_roth: number;
  baseline_final_taxable: number;
  baseline_final_net_worth: number;

  blueprint_final_traditional: number;
  blueprint_final_roth: number;
  blueprint_final_taxable: number;
  blueprint_final_net_worth: number;

  baseline_years: YearlyResult[];
  blueprint_years: YearlyResult[];

  strategy: string;
  projection_years: number;

  // GI-specific metrics (null for Growth products)
  gi_annual_income_gross: number | null;
  gi_annual_income_net: number | null;
  gi_income_start_age: number | null;
  gi_depletion_age: number | null;
  gi_income_base_at_start: number | null;
  gi_income_base_at_income_age: number | null;
  gi_total_gross_paid: number | null;
  gi_total_net_paid: number | null;
  gi_yearly_data: GIYearlyData[] | null;
  gi_total_rider_fees: number | null;
  gi_payout_percent: number | null;
  gi_roll_up_description: string | null;

  // GI 4-phase model fields (null for Growth products)
  gi_conversion_phase_years: number | null;
  gi_purchase_age: number | null;
  gi_purchase_amount: number | null;
  gi_total_conversion_tax: number | null;
  gi_deferral_years: number | null;

  // GI comparison metrics - Strategy (Roth GI) vs Baseline (Traditional GI)
  gi_strategy_annual_income_net: number | null;
  gi_baseline_annual_income_gross: number | null;
  gi_baseline_annual_income_net: number | null;
  gi_baseline_annual_tax: number | null;
  gi_baseline_income_base: number | null;
  gi_annual_income_advantage: number | null;
  gi_lifetime_income_advantage: number | null;
  gi_tax_free_wealth_created: number | null;
  gi_break_even_years: number | null;
  gi_break_even_age: number | null;
  gi_percent_improvement: number | null;
  gi_baseline_yearly_data: GIYearlyData[] | null;
}

export type ProjectionInsert = Omit<Projection, 'id' | 'created_at'>;

export interface ProjectionResponse {
  projection: Projection;
  cached: boolean;
}
