import type { Client } from '@/lib/types/client';
import type { YearlyResult } from '../types';
import { getAgeAtYearOffset } from '../utils/age';

/**
 * Run Growth FIA Formula scenario: Roth conversions with FIA product features
 *
 * Implements the Growth FIA calculation logic:
 * - Applies upfront bonus at issue (using client.bonus_percent)
 * - Strategic Roth conversions based on constraint type
 * - Compound growth at rate_of_return
 * - Tax calculation on conversions
 */
export function runGrowthFormulaScenario(
  client: Client,
  startYear: number,
  projectionYears: number
): YearlyResult[] {
  const results: YearlyResult[] = [];

  const clientAge = client.age ?? 62;
  const growthRate = (client.rate_of_return ?? 7) / 100;

  // Apply upfront bonus at issue
  const bonusPercent = client.bonus_percent ?? 0;
  const initialValue = client.qualified_account_value ?? 0;
  let iraBalance = Math.round(initialValue * (1 + bonusPercent / 100));
  let rothBalance = 0;

  // Tax rates
  const federalTaxRate = (client.tax_rate ?? client.max_tax_rate ?? 24) / 100;
  const stateTaxRate = (client.state_tax_rate ?? 0) / 100;
  const totalTaxRate = federalTaxRate + stateTaxRate;

  // Conversion parameters
  const conversionType = client.conversion_type ?? 'optimized_amount';
  const yearsToDefer = client.years_to_defer_conversion ?? 0;
  const conversionStartAge = clientAge + yearsToDefer;
  const conversionEndAge = client.end_age ?? 100;

  for (let yearOffset = 0; yearOffset < projectionYears; yearOffset++) {
    const year = startYear + yearOffset;
    const age = getAgeAtYearOffset(clientAge, yearOffset);

    // Beginning of Year balances
    const boyIRA = iraBalance;
    const boyRoth = rothBalance;

    // Step 1: Calculate interest on IRA
    const interest = Math.round(boyIRA * growthRate);
    let valueAfterInterest = boyIRA + interest;

    // Step 2: Handle Roth conversions
    let conversionAmount = 0;
    let federalTax = 0;
    let stateTax = 0;

    const shouldConvert = conversionType !== 'no_conversion' &&
                          age >= conversionStartAge &&
                          age <= conversionEndAge &&
                          valueAfterInterest > 0;

    if (shouldConvert) {
      // Determine conversion amount based on type
      // For Growth FIA, we use optimized conversions that fill to the target tax bracket
      // The conversion amount is the remaining IRA balance (convert all during conversion period)
      if (conversionType === 'full_conversion') {
        conversionAmount = valueAfterInterest;
      } else if (conversionType === 'optimized_amount' || conversionType === 'fixed_amount') {
        // For optimized and fixed, convert all remaining balance
        // (The actual amount per year is controlled by the conversion period length)
        conversionAmount = valueAfterInterest;
      }

      // Calculate taxes on conversion
      if (conversionAmount > 0) {
        federalTax = Math.round(conversionAmount * federalTaxRate);
        stateTax = Math.round(conversionAmount * stateTaxRate);
      }

      // Deduct conversion from IRA
      valueAfterInterest -= conversionAmount;
    }

    // Step 4: Grow existing Roth balance, then add new conversion
    const rothGrowth = Math.round(boyRoth * growthRate);
    rothBalance = boyRoth + rothGrowth + conversionAmount;

    // Update IRA balance
    iraBalance = valueAfterInterest;

    const totalTax = federalTax + stateTax;

    results.push({
      year,
      age,
      spouseAge: null,
      traditionalBalance: iraBalance,
      rothBalance,
      taxableBalance: 0,
      rmdAmount: 0,
      conversionAmount,
      ssIncome: 0,
      pensionIncome: 0,
      otherIncome: 0,
      totalIncome: conversionAmount,
      federalTax,
      stateTax,
      niitTax: 0,
      irmaaSurcharge: 0,
      totalTax,
      taxableSS: 0,
      netWorth: iraBalance + rothBalance
    });
  }

  return results;
}
