import type { Client } from '@/lib/types/client';

/**
 * Get non-SSI other income for a specific year.
 *
 * Priority:
 * 1. If the client has year-by-year `non_ssi_income` entries, look up by year.
 *    - If an entry exists for the year, return its `gross_taxable` value.
 *    - If no entry exists for the year, return 0 (income has ended or not started).
 * 2. If no income table entries exist, fall back to the flat `gross_taxable_non_ssi` field.
 * 3. Final fallback to `defaultValue` (0 by default).
 */
export function getNonSSIIncomeForYear(
  client: Client,
  year: number,
  defaultValue: number = 0
): number {
  // If income table has entries, use year-specific lookup
  if (client.non_ssi_income && client.non_ssi_income.length > 0) {
    const entry = client.non_ssi_income.find(e => e.year === year);
    return entry ? entry.gross_taxable : 0;
  }

  // Fall back to flat field
  return client.gross_taxable_non_ssi ?? defaultValue;
}

/**
 * Get tax-exempt non-SSI income for a specific year.
 *
 * Same lookup logic as getNonSSIIncomeForYear but returns the `tax_exempt` field.
 */
export function getTaxExemptIncomeForYear(
  client: Client,
  year: number,
  defaultValue: number = 0
): number {
  // If income table has entries, use year-specific lookup
  if (client.non_ssi_income && client.non_ssi_income.length > 0) {
    const entry = client.non_ssi_income.find(e => e.year === year);
    return entry ? entry.tax_exempt : 0;
  }

  // Fall back to flat field
  return client.tax_exempt_non_ssi ?? defaultValue;
}
