import type { Client, NonSSIIncomeEntry } from '@/lib/types/client';
import { getAgeAtYearOffset } from '@/lib/calculations/utils/age';

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

/** Projection horizon in years — the same (end_age − age) the engines use. */
export function projectionYearsFor(client: Client): number {
  return client.age && client.end_age
    ? client.end_age - client.age
    : (client.projection_years ?? 30);
}

/**
 * Fold a per-calendar-year gross-taxable schedule (cents) into the client's
 * non-SSI income table. Used by every "extra ordinary income stream" overlay
 * (held-back IRA RMDs, QLAC payouts) so they all produce the SAME table shape:
 * one row per year from the current year over the projection horizon, carrying
 * the client's existing income for that year (flat field OR table — the
 * lookups handle both) plus the schedule's amount. The flat fields are cleared
 * afterwards so nothing is summed twice (the table already wins over them —
 * clearing just keeps it unambiguous). Overlays compose: a second call reads
 * the first call's table through getNonSSIIncomeForYear.
 */
export function mergeIncomeScheduleIntoClient(client: Client, byYear: Map<number, number>): Client {
  const currentYear = new Date().getFullYear();
  const clientAge = client.age && client.age > 0 ? client.age : 62;
  const projectionYears = projectionYearsFor(client);

  const merged: NonSSIIncomeEntry[] = [];
  for (let offset = 0; offset < projectionYears; offset++) {
    const year = currentYear + offset;
    const extra = byYear.get(year) ?? 0;
    const existingGross = getNonSSIIncomeForYear(client, year);
    const existingExempt = getTaxExemptIncomeForYear(client, year);
    if (existingGross === 0 && existingExempt === 0 && extra === 0) continue;
    merged.push({
      year,
      age: getAgeAtYearOffset(clientAge, offset),
      gross_taxable: existingGross + extra,
      tax_exempt: existingExempt,
    });
  }
  return {
    ...client,
    non_ssi_income: merged,
    gross_taxable_non_ssi: 0,
    tax_exempt_non_ssi: 0,
  };
}
