import type { Client } from '@/lib/types/client';
import type { YearlyResult } from '../types';
import { getAgeAtYearOffset } from '../utils/age';
import { calculateOptimalConversion, calculateConversionFederalTax } from '../modules/federal-tax';
import { calculateConversionStateTax } from '../modules/state-tax';
import { getStandardDeduction } from '@/lib/data/standard-deductions';
import { getStateTaxRate } from '@/lib/data/states';

/**
 * Run Growth FIA Formula scenario: Roth conversions with FIA product features
 *
 * Implements the Growth FIA calculation logic:
 * - Applies upfront bonus at issue (using client.bonus_percent)
 * - Strategic Roth conversions that fill up to target tax bracket
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

  // Apply upfront premium bonus at issue
  const bonusPercent = client.bonus_percent ?? 0;
  const initialValue = client.qualified_account_value ?? 0;
  let iraBalance = Math.round(initialValue * (1 + bonusPercent / 100));
  let rothBalance = 0;
  let taxableBalance = 0; // Track taxes paid externally

  // Anniversary bonus (EquiTrust MarketEdge: 4% at end of years 1, 2, 3)
  const anniversaryBonusPercent = (client.anniversary_bonus_percent ?? 0) / 100;
  const anniversaryBonusYears = client.anniversary_bonus_years ?? 0;

  // Tax rates
  const maxTaxRate = client.max_tax_rate ?? 24;
  const stateTaxRateDecimal = client.state_tax_rate !== undefined && client.state_tax_rate !== null
    ? client.state_tax_rate / 100
    : getStateTaxRate(client.state);

  // Conversion parameters
  const conversionType = client.conversion_type ?? 'optimized_amount';
  const yearsToDefer = client.years_to_defer_conversion ?? 0;
  const conversionStartAge = clientAge + yearsToDefer;
  const conversionEndAge = client.end_age ?? 100;

  // Other income for bracket calculations
  const otherIncome = client.gross_taxable_non_ssi ?? 0;

  for (let yearOffset = 0; yearOffset < projectionYears; yearOffset++) {
    const year = startYear + yearOffset;
    const age = getAgeAtYearOffset(clientAge, yearOffset);

    // Beginning of Year balances
    const boyIRA = iraBalance;
    const boyRoth = rothBalance;
    const boyTaxable = taxableBalance;

    // Standard deduction (age-adjusted)
    const deductions = getStandardDeduction(client.filing_status, age, undefined, year);

    // Existing taxable income (before conversion)
    const existingTaxableIncome = Math.max(0, otherIncome - deductions);

    // Step 1: Handle Roth conversions BEFORE interest (so conversion is based on BOY balance)
    let conversionAmount = 0;
    let federalTax = 0;
    let stateTax = 0;

    const shouldConvert = conversionType !== 'no_conversion' &&
                          age >= conversionStartAge &&
                          age <= conversionEndAge &&
                          boyIRA > 0;

    if (shouldConvert) {
      // Determine conversion amount based on type
      if (conversionType === 'full_conversion') {
        // Convert everything at once
        conversionAmount = boyIRA;
      } else {
        // For optimized_amount and fixed_amount: fill up to target bracket ceiling
        conversionAmount = calculateOptimalConversion(
          boyIRA,
          existingTaxableIncome,
          maxTaxRate,
          client.filing_status,
          year
        );
      }

      // Calculate taxes on conversion
      if (conversionAmount > 0) {
        // Federal tax (marginal)
        federalTax = calculateConversionFederalTax(
          conversionAmount,
          existingTaxableIncome,
          client.filing_status,
          year
        );

        // State tax (flat rate)
        stateTax = calculateConversionStateTax(
          conversionAmount,
          client.state,
          stateTaxRateDecimal
        );
      }
    }

    // Execute conversion
    const iraAfterConversion = boyIRA - conversionAmount;
    const rothAfterConversion = boyRoth + conversionAmount;

    // Step 2: Calculate interest AFTER conversion
    const iraInterest = Math.round(iraAfterConversion * growthRate);
    const rothInterest = Math.round(rothAfterConversion * growthRate);

    // Update balances
    iraBalance = iraAfterConversion + iraInterest;
    rothBalance = rothAfterConversion + rothInterest;

    // Step 3: Apply anniversary bonus to IRA (annuity AV) if within bonus years
    // yearOffset is 0-indexed: yearOffset 0 = first year of policy
    // Anniversary bonuses apply at end of years 1, 2, 3 (yearOffset 0, 1, 2)
    if (anniversaryBonusPercent > 0 && yearOffset < anniversaryBonusYears) {
      const anniversaryBonusAmount = Math.round(iraBalance * anniversaryBonusPercent);
      iraBalance = iraBalance + anniversaryBonusAmount;
    }

    // Taxes paid from external funds (taxable account goes negative)
    const totalTax = federalTax + stateTax;
    taxableBalance = boyTaxable - totalTax;

    results.push({
      year,
      age,
      spouseAge: null,
      traditionalBalance: iraBalance,
      rothBalance,
      taxableBalance,
      rmdAmount: 0,
      conversionAmount,
      ssIncome: 0,
      pensionIncome: 0,
      otherIncome,
      totalIncome: conversionAmount + otherIncome,
      federalTax,
      stateTax,
      niitTax: 0,
      irmaaSurcharge: 0,
      totalTax,
      taxableSS: 0,
      netWorth: iraBalance + rothBalance + taxableBalance
    });
  }

  return results;
}
