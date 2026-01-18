import type { Client } from '@/lib/types/client';

/**
 * Audit log entry as stored in database
 * All monetary values in cents
 */
export interface AuditLogEntry {
  id: string;
  created_at: string;
  user_id: string;
  client_id: string;
  input_hash: string;
  client_snapshot: Client;
  strategy: string;
  break_even_age: number | null;
  total_tax_savings: number;
  heir_benefit: number;
  baseline_final_wealth: number;
  blueprint_final_wealth: number;
  calculation_ms: number | null;
  engine_version: string;
}

/**
 * Insert payload for new audit log entry
 * Omit server-generated fields
 */
export type AuditLogInsert = Omit<AuditLogEntry, 'id' | 'created_at'>;

/**
 * Query result from getCalculationHistory
 */
export interface AuditLogSummary {
  id: string;
  created_at: string;
  strategy: string;
  break_even_age: number | null;
  total_tax_savings: number;
  blueprint_final_wealth: number;
  engine_version: string;
}
