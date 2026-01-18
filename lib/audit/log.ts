import type { SupabaseClient } from '@supabase/supabase-js';
import type { Client } from '@/lib/types/client';
import type { SimulationResult } from '@/lib/calculations/types';
import type { AuditLogInsert, AuditLogSummary } from './types';
import { hashClientInput } from './hash';

const ENGINE_VERSION = '1.0.0';

/**
 * Log a calculation run to the audit table
 * Fire-and-forget: Does not await result to avoid blocking UI
 *
 * @param supabase - Supabase client instance
 * @param client - Client data at time of calculation
 * @param result - Simulation result
 * @param durationMs - Calculation time in milliseconds
 */
export function logCalculation(
  supabase: SupabaseClient,
  client: Client,
  result: SimulationResult,
  durationMs: number
): void {
  // Fire-and-forget: Don't await to avoid blocking
  (async () => {
    try {
      const inputHash = await hashClientInput(client);

      const lastBaseline = result.baseline[result.baseline.length - 1];
      const lastBlueprint = result.blueprint[result.blueprint.length - 1];

      const entry: AuditLogInsert = {
        user_id: client.user_id,
        client_id: client.id,
        input_hash: inputHash,
        client_snapshot: client,
        strategy: client.strategy,
        break_even_age: result.breakEvenAge,
        total_tax_savings: result.totalTaxSavings,
        heir_benefit: result.heirBenefit,
        baseline_final_wealth: lastBaseline.netWorth,
        blueprint_final_wealth: lastBlueprint.netWorth,
        calculation_ms: Math.round(durationMs),
        engine_version: ENGINE_VERSION,
      };

      // Insert to calculation_log table (public schema)
      const { error } = await supabase
        .from('calculation_log')
        .insert(entry);

      if (error) {
        // Log error but don't throw - audit failure shouldn't break calculations
        console.error('[Audit] Failed to log calculation:', error.message);
      }
    } catch (err) {
      console.error('[Audit] Error in audit logging:', err);
    }
  })();
}

/**
 * Get calculation history for a client
 * Returns most recent N entries (summary only)
 */
export async function getCalculationHistory(
  supabase: SupabaseClient,
  clientId: string,
  limit = 10
): Promise<AuditLogSummary[]> {
  const { data, error } = await supabase
    .from('calculation_log')
    .select(`
      id,
      created_at,
      strategy,
      break_even_age,
      total_tax_savings,
      blueprint_final_wealth,
      engine_version
    `)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[Audit] Failed to fetch history:', error.message);
    return [];
  }

  return data ?? [];
}

/**
 * Check if a calculation with the same inputs already exists
 * Uses input_hash for deduplication
 */
export async function hasExistingCalculation(
  supabase: SupabaseClient,
  client: Client
): Promise<boolean> {
  const inputHash = await hashClientInput(client);

  const { data, error } = await supabase
    .from('calculation_log')
    .select('id')
    .eq('client_id', client.id)
    .eq('input_hash', inputHash)
    .limit(1);

  if (error) {
    console.error('[Audit] Failed to check existing:', error.message);
    return false;
  }

  return (data?.length ?? 0) > 0;
}
