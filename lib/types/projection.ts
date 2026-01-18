import type { YearlyResult } from '@/lib/calculations';

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
}

export type ProjectionInsert = Omit<Projection, 'id' | 'created_at'>;

export interface ProjectionResponse {
  projection: Projection;
  cached: boolean;
}
