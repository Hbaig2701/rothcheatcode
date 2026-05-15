/**
 * Marginal RMD tax — the federal+state tax dollars actually CAUSED by the RMDs,
 * isolated from the background tax that the client would owe regardless on SS,
 * pension, wages, etc.
 *
 * For each year with an RMD, re-runs the tax calculation as if the RMD weren't
 * taken (just SS + other income + tax-exempt) and takes the difference vs the
 * year's actual federal+state tax. The sum across years isolates the tax cost
 * of the forced distribution.
 *
 * Used wherever a surface labels a number as "Tax on RMDs" — keeps that label
 * honest. Without this isolation, "Tax on RMDs" surfaces show the year/lifetime
 * total fed+state, which silently includes tax on SS and other income — that's
 * the asymmetry advisors keep catching.
 *
 * Lives in this shared lib so the PDF route, the in-app dashboard, and any
 * future surface use the SAME computation. Drift between surfaces is the
 * structural problem we keep getting bitten by.
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
 * @param years Per-year projection rows (baseline_years or blueprint_years).
 * @param client The client record (needs filing_status, state, state_tax_rate,
 *   tax_exempt_non_ssi).
 * @returns Total marginal RMD tax across the projection, in cents.
 */
export function computeMarginalRMDTax(
  years: YearlyResult[],
  client: ClientLike
): number {
  const stateTaxRateOverride =
    client.state_tax_rate !== undefined && client.state_tax_rate !== null
      ? client.state_tax_rate / 100
      : undefined;

  let total = 0;
  for (const year of years) {
    const rmd = year.rmdAmount ?? 0;
    if (rmd <= 0) continue;

    const taxWithRMD = (year.federalTax ?? 0) + (year.stateTax ?? 0);

    // Recompute tax assuming no RMD this year. otherIncome on the engine row
    // already EXCLUDES the RMD (RMD is summed in separately as grossTaxableIncome
    // inside the engine). So passing `otherIncome` alone here gives the
    // "without RMD" picture, including any change in SS taxability.
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

    const taxInfoNoRMD = computeTaxableIncomeWithSS({
      otherIncome: year.otherIncome ?? 0,
      ssBenefits: year.ssIncome ?? 0,
      taxExemptInterest: taxExemptNonSSI,
      deductions,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      filingStatus: client.filing_status as any,
    });

    const fedNoRMD = calculateFederalTax({
      taxableIncome: taxInfoNoRMD.taxableIncome,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      filingStatus: client.filing_status as any,
      taxYear: year.year,
    }).totalTax;

    const stateNoRMD = calculateStateTax({
      taxableIncome: taxInfoNoRMD.taxableIncome,
      state: client.state ?? "",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      filingStatus: client.filing_status as any,
      overrideRate: stateTaxRateOverride,
    }).totalTax;

    const taxWithoutRMD = fedNoRMD + stateNoRMD;
    total += Math.max(0, taxWithRMD - taxWithoutRMD);
  }
  return total;
}
