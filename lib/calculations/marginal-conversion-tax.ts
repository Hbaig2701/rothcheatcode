/**
 * Marginal Roth-conversion tax — the federal+state tax dollars CAUSED by the
 * conversion in a given year, isolated from the background tax that the client
 * would owe regardless on SS, pension, RMDs, etc.
 *
 * Mirrors the pattern in `marginal-rmd-tax.ts`: re-runs the tax calculation
 * as if the conversion didn't happen, then takes the difference vs the year's
 * actual fed+state tax. The result is the incremental cost of the conversion
 * decision specifically.
 *
 * Used in Story Mode so the advisor can tell the client "this strategy costs
 * you $X in conversion tax" without lumping in tax they'd owe on Social
 * Security and pension regardless. From Greg Stopp's call notes: "the
 * presentation lumps everything together and confuses clients." This isolates
 * the conversion line cleanly.
 *
 * The two-column Story Mode display reads:
 *   - "Tax on conversion only" → computePerYearMarginalConversionTax(year, client)
 *   - "Total tax this year"    → year.federalTax + year.stateTax
 */
import { calculateFederalTax } from "./modules/federal-tax";
import { calculateStateTax } from "./modules/state-tax";
import { computeTaxableIncomeWithSS } from "./tax-helpers";
import { getStandardDeduction } from "@/lib/data/standard-deductions";
import { getTaxExemptIncomeForYear } from "./utils/income";
import type { YearlyResult } from "./types";

interface ClientLike {
  filing_status: string;
  state?: string | null;
  state_tax_rate?: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tax_exempt_non_ssi?: any;
}

/**
 * Tax dollars (cents) attributable to a single year's conversion specifically.
 * Returns 0 if the year had no conversion.
 */
export function computePerYearMarginalConversionTax(
  year: YearlyResult,
  client: ClientLike
): number {
  const conv = year.conversionAmount ?? 0;
  if (conv <= 0) return 0;

  const taxWithConv = (year.federalTax ?? 0) + (year.stateTax ?? 0);

  // Build the "without conversion" income picture. otherIncome on the engine
  // row excludes both RMD and conversion, so we add back the RMD (which would
  // still happen without the conversion) and leave the conversion out.
  const otherIncomeWithoutConv = (year.otherIncome ?? 0) + (year.rmdAmount ?? 0);

  const stateTaxRateOverride =
    client.state_tax_rate !== undefined && client.state_tax_rate !== null
      ? client.state_tax_rate / 100
      : undefined;

  const taxExemptNonSSI = getTaxExemptIncomeForYear(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client as any,
    year.year,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).tax_exempt_non_ssi ?? 0
  );
  const deductions =
    year.standardDeduction ??
    getStandardDeduction(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.filing_status as any,
      year.age,
      year.spouseAge ?? undefined,
      year.year
    );

  const taxInfoNoConv = computeTaxableIncomeWithSS({
    otherIncome: otherIncomeWithoutConv,
    ssBenefits: year.ssIncome ?? 0,
    taxExemptInterest: taxExemptNonSSI,
    deductions,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filingStatus: client.filing_status as any,
    age: year.age,
    spouseAge: year.spouseAge ?? undefined,
    taxYear: year.year,
  });

  const fedNoConv = calculateFederalTax({
    taxableIncome: taxInfoNoConv.taxableIncome,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filingStatus: client.filing_status as any,
    taxYear: year.year,
  }).totalTax;

  const stateNoConv = calculateStateTax({
    taxableIncome: taxInfoNoConv.taxableIncome,
    state: client.state ?? "",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filingStatus: client.filing_status as any,
    overrideRate: stateTaxRateOverride,
  }).totalTax;

  return Math.max(0, taxWithConv - (fedNoConv + stateNoConv));
}

/**
 * Total marginal conversion tax across the projection, in cents.
 */
export function computeTotalMarginalConversionTax(
  years: YearlyResult[],
  client: ClientLike
): number {
  let total = 0;
  for (const year of years) {
    total += computePerYearMarginalConversionTax(year, client);
  }
  return total;
}
