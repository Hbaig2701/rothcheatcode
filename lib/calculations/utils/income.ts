import type { Client } from '@/lib/types/client';

/**
 * Get non-SSI other income for a specific year.
 *
 * Priority:
 * 1. If the client has year-by-year `non_ssi_income` entries, SUM every entry
 *    for the year and return the total `gross_taxable`.
 *    - A client can have several income streams of DIFFERENT types in the same
 *      year (e.g. pension + rental + annuity), each stored as its own row — the
 *      income table deliberately keeps them as separate entries. So we must add
 *      them up, not pick one.
 *    - If no entry exists for the year, the sum is 0 (income has ended or not
 *      started).
 * 2. If no income table entries exist, fall back to the flat `gross_taxable_non_ssi` field.
 * 3. Final fallback to `defaultValue` (0 by default).
 *
 * NOTE: this previously used `.find()`, which returned only the FIRST matching
 * entry and silently dropped every other income stream for that year (Mike
 * Catone / Guillermo Silesky ticket: pension counted, rental + annuity dropped,
 * so the optimizer over-converted into phantom 24%-bracket room).
 */
export function getNonSSIIncomeForYear(
  client: Client,
  year: number,
  defaultValue: number = 0
): number {
  // If income table has entries, sum all rows for the year
  if (client.non_ssi_income && client.non_ssi_income.length > 0) {
    return client.non_ssi_income
      .filter(e => e.year === year)
      .reduce((sum, e) => sum + (e.gross_taxable ?? 0), 0);
  }

  // Fall back to flat field
  return client.gross_taxable_non_ssi ?? defaultValue;
}

/**
 * Get tax-exempt non-SSI income for a specific year.
 *
 * Same lookup logic as getNonSSIIncomeForYear (sums every entry for the year)
 * but returns the `tax_exempt` field.
 */
export function getTaxExemptIncomeForYear(
  client: Client,
  year: number,
  defaultValue: number = 0
): number {
  // If income table has entries, sum all rows for the year
  if (client.non_ssi_income && client.non_ssi_income.length > 0) {
    return client.non_ssi_income
      .filter(e => e.year === year)
      .reduce((sum, e) => sum + (e.tax_exempt ?? 0), 0);
  }

  // Fall back to flat field
  return client.tax_exempt_non_ssi ?? defaultValue;
}
