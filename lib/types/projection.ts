import type { YearlyResult } from '@/lib/calculations';

/**
 * GI year-by-year tracking data (stored as JSONB)
 */
export interface GIYearlyData {
  year: number;
  age: number;
  phase: 'deferral' | 'income';
  accountValue: number;           // In cents
  incomeBase: number;             // In cents
  guaranteedIncomeGross: number;  // In cents (0 during deferral)
  guaranteedIncomeNet: number;    // After-tax (0 during deferral)
  conversionAmount: number;       // Roth conversions during deferral only
  riderFee: number;               // Annual rider fee deducted (cents)
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
}

export type ProjectionInsert = Omit<Projection, 'id' | 'created_at'>;

export interface ProjectionResponse {
  projection: Projection;
  cached: boolean;
}
