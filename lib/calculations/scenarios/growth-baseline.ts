import type { Client } from '@/lib/types/client';
import type { YearlyResult } from '../types';
import { getAgeAtYearOffset } from '../utils/age';
import { computeTaxableIncomeWithSS } from '../tax-helpers';
import { getStandardDeduction } from '@/lib/data/standard-deductions';

/**
 * Run Growth FIA Baseline scenario: simple compound growth, no conversions, no RMDs
 *
 * This is the "do nothing" comparison for Growth FIA products:
 * - Account grows at baseline_comparison_rate (default: same as rate_of_return)
 * - No Roth conversions
 * - No RMD withdrawals (money stays in tax-deferred annuity)
 * - Final balance taxed at heir_tax_rate when inherited
 *
 * This differs from the standard baseline which includes RMD withdrawals.
 * For Growth FIA, we're comparing "convert to Roth" vs "keep in annuity until death".
 */
export function runGrowthBaselineScenario(
  client: Client,
  startYear: number,
  projectionYears: number
): YearlyResult[] {
  const results: YearlyResult[] = [];

  const clientAge = client.age ?? 62;

  // Use baseline_comparison_rate, fallback to rate_of_return (should be synced)
  const growthRate = (client.baseline_comparison_rate ?? client.rate_of_return ?? 7) / 100;

  // Initial balance - baseline does NOT apply insurance product bonus
  // This represents keeping money in a standard account without the FIA bonus
  let iraBalance = client.qualified_account_value ?? 0;
  const rothBalance = 0; // No Roth in baseline
  const taxableBalance = 0;

  // SSI parameters (taxable portion computed via the standard provisional-
  // income formula — up to 85% when combined with any other income)
  const primarySsStartAge = client.ssi_payout_age ?? client.ss_start_age ?? 67;
  const primarySsAmount = client.ssi_annual_amount ?? client.ss_self ?? 0;
  const spouseSsStartAge = client.spouse_ssi_payout_age ?? 67;
  const spouseSsAmount = client.spouse_ssi_annual_amount ?? client.ss_spouse ?? 0;
  const initialSpouseAge = client.spouse_age ?? null;
  const ssiColaRate = 0.02;

  for (let yearOffset = 0; yearOffset < projectionYears; yearOffset++) {
    const year = startYear + yearOffset;
    const age = getAgeAtYearOffset(clientAge, yearOffset);

    // Beginning of Year balance
    const boyIRA = iraBalance;

    // Simple compound growth - no distributions
    const interest = Math.round(boyIRA * growthRate);

    // End of Year balance
    iraBalance = boyIRA + interest;

    // Primary SSI income (with COLA)
    const primaryYearsCollecting = age >= primarySsStartAge ? age - primarySsStartAge : -1;
    const primarySsIncome = primaryYearsCollecting >= 0
      ? Math.round(primarySsAmount * Math.pow(1 + ssiColaRate, primaryYearsCollecting))
      : 0;

    // Spouse SSI income (with COLA) — MFJ only
    let spouseSsIncome = 0;
    if (client.filing_status === 'married_filing_jointly' && spouseSsAmount > 0) {
      const currentSpouseAge = initialSpouseAge !== null ? initialSpouseAge + yearOffset : 0;
      const spouseYearsCollecting = currentSpouseAge >= spouseSsStartAge ? currentSpouseAge - spouseSsStartAge : -1;
      spouseSsIncome = spouseYearsCollecting >= 0
        ? Math.round(spouseSsAmount * Math.pow(1 + ssiColaRate, spouseYearsCollecting))
        : 0;
    }

    const ssIncome = primarySsIncome + spouseSsIncome;

    const currentSpouseAge = initialSpouseAge !== null ? initialSpouseAge + yearOffset : null;

    // Compute taxable SS for display — no RMDs, no conversions, but SS can
    // still be partially taxable if the client has other income eventually.
    // Here otherIncome is always 0 (Growth FIA baseline has no income events),
    // so provisional = 0.5 × SS; taxable SS follows from the torpedo formula.
    const growthBaselineDeductions = getStandardDeduction(client.filing_status, age, currentSpouseAge ?? undefined, year);
    const growthBaselineTaxInfo = computeTaxableIncomeWithSS({
      otherIncome: 0,
      ssBenefits: ssIncome,
      taxExemptInterest: 0,
      deductions: growthBaselineDeductions,
      filingStatus: client.filing_status,
    });

    results.push({
      year,
      age,
      spouseAge: currentSpouseAge,
      traditionalBalance: iraBalance,
      rothBalance: 0,
      taxableBalance: 0,
      rmdAmount: 0, // No RMDs in Growth FIA baseline (money stays in annuity until death)
      conversionAmount: 0, // No conversions in baseline
      ssIncome,
      pensionIncome: 0,
      otherIncome: 0,
      totalIncome: ssIncome, // Only SSI flows as income in baseline
      federalTax: 0, // No taxes during accumulation
      stateTax: 0,
      niitTax: 0,
      irmaaSurcharge: 0,
      totalTax: 0,
      taxableSS: growthBaselineTaxInfo.taxableSS,
      netWorth: iraBalance, // No Roth or taxable in baseline (no conversions, no RMDs)
      // Extended fields for adjustable columns
      traditionalBOY: boyIRA,
      rothBOY: 0,
      taxableBOY: 0,
      traditionalGrowth: interest,
      rothGrowth: 0,
      taxableGrowth: 0,
      productBonusApplied: 0,
      magi: growthBaselineTaxInfo.agi + (ssIncome - growthBaselineTaxInfo.taxableSS),
      agi: growthBaselineTaxInfo.agi,
      standardDeduction: growthBaselineDeductions,
      taxableIncome: growthBaselineTaxInfo.taxableIncome,
      federalTaxBracket: 0,
      irmaaTier: 0,
      federalTaxOnSS: 0,
      federalTaxOnConversions: 0,
      federalTaxOnOrdinaryIncome: 0,
      stateTaxOnSS: 0,
      stateTaxOnConversions: 0,
      stateTaxOnOrdinaryIncome: 0,
      totalIRAWithdrawal: 0, // No withdrawals in growth baseline
    });
  }

  return results;
}
