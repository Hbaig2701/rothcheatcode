import type { Client } from '@/lib/types/client';
import type { YearlyResult } from '../types';
import { getAgeAtYearOffset } from '../utils/age';

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

  for (let yearOffset = 0; yearOffset < projectionYears; yearOffset++) {
    const year = startYear + yearOffset;
    const age = getAgeAtYearOffset(clientAge, yearOffset);

    // Beginning of Year balance
    const boyIRA = iraBalance;

    // Simple compound growth - no distributions
    const interest = Math.round(boyIRA * growthRate);

    // End of Year balance
    iraBalance = boyIRA + interest;

    results.push({
      year,
      age,
      spouseAge: null,
      traditionalBalance: iraBalance,
      rothBalance: 0,
      taxableBalance: 0,
      rmdAmount: 0, // No RMDs in Growth FIA baseline
      conversionAmount: 0, // No conversions in baseline
      ssIncome: 0,
      pensionIncome: 0,
      otherIncome: 0,
      totalIncome: 0,
      federalTax: 0, // No taxes during accumulation
      stateTax: 0,
      niitTax: 0,
      irmaaSurcharge: 0,
      totalTax: 0,
      taxableSS: 0,
      netWorth: iraBalance // Just the traditional IRA balance
    });
  }

  return results;
}
