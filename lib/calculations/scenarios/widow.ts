import type { Client } from '@/lib/types/client';
import type { YearlyResult } from '../types';
import { calculateAge } from '../utils/age';
import { calculateRMD } from '../modules/rmd';
import { calculateFederalTax, calculateTaxableIncome } from '../modules/federal-tax';
import { calculateStateTax } from '../modules/state-tax';
import { calculateSSTaxableAmount } from '../modules/social-security';
import { calculateNIIT } from '../modules/niit';
import { calculateIRMAA } from '../modules/irmaa';
import { adjustForInflation } from '../modules/inflation';
import { getStandardDeduction } from '@/lib/data/standard-deductions';

export interface WidowScenarioInput {
  client: Client;
  deathYear: number;        // Year spouse passes
  projectionYears: number;  // Years to project after death
}

/**
 * Run scenario as single filer after spouse death
 * Key changes from baseline:
 * - Filing status: single
 * - No spouse Social Security
 * - Standard deduction for single filer
 * - Single filer tax brackets (compressed)
 */
export function runWidowScenario(
  input: WidowScenarioInput
): YearlyResult[] {
  const { client, deathYear, projectionYears } = input;
  const results: YearlyResult[] = [];

  const birthYear = new Date(client.date_of_birth).getFullYear();
  const growthRate = (client.growth_rate ?? 6) / 100;
  const inflationRate = (client.inflation_rate ?? 2.5) / 100;

  // Start balances - assume inherited spouse's accounts (simplified)
  let traditionalBalance = client.traditional_ira ?? 0;
  let rothBalance = client.roth_ira ?? 0;
  let taxableBalance = client.taxable_accounts ?? 0;

  // Calculate years from death year to align inflation
  const deathYearOffset = deathYear - new Date().getFullYear();

  for (let yearOffset = 0; yearOffset < projectionYears; yearOffset++) {
    const year = deathYear + yearOffset;
    const age = calculateAge(client.date_of_birth, year);
    const totalYearsFromNow = deathYearOffset + yearOffset;

    // Apply growth
    traditionalBalance += Math.round(traditionalBalance * growthRate);
    rothBalance += Math.round(rothBalance * growthRate);
    const taxableGrowth = Math.round(taxableBalance * growthRate);
    taxableBalance += taxableGrowth;

    // Calculate RMD
    const rmdResult = calculateRMD({ age, traditionalBalance, birthYear });
    const rmdAmount = rmdResult.rmdAmount;
    traditionalBalance -= rmdAmount;

    // Social Security - ONLY client's benefit, no spouse
    const ssStartAge = client.ss_start_age ?? 67;
    // Survivor could take higher of own or 100% of spouse's - simplified to own only
    const ssIncome = age >= ssStartAge
      ? adjustForInflation(client.ss_self ?? 0, totalYearsFromNow, inflationRate)
      : 0;

    // Other income (inflation adjusted from original calculation year)
    const pensionIncome = adjustForInflation(client.pension ?? 0, totalYearsFromNow, inflationRate);
    const otherIncome = adjustForInflation(client.other_income ?? 0, totalYearsFromNow, inflationRate);

    // SS taxation - NOW AS SINGLE FILER
    const ssResult = calculateSSTaxableAmount({
      ssBenefits: ssIncome,
      otherIncome: rmdAmount + pensionIncome + otherIncome,
      taxExemptInterest: 0,
      filingStatus: 'single'  // KEY CHANGE: single filer
    });

    // Gross income
    const grossIncome = rmdAmount + ssResult.taxableAmount + pensionIncome + otherIncome;

    // Deductions - SINGLE FILER (smaller deduction)
    const deductions = getStandardDeduction('single', age, undefined);
    const taxableIncome = calculateTaxableIncome(grossIncome, deductions);

    // Federal tax - SINGLE BRACKETS (compressed)
    const federalResult = calculateFederalTax({
      taxableIncome,
      filingStatus: 'single',  // KEY CHANGE
      taxYear: year
    });

    // State tax - single
    const stateResult = calculateStateTax({
      taxableIncome,
      state: client.state,
      filingStatus: 'single'
    });

    // NIIT
    const niitResult = client.include_niit
      ? calculateNIIT({
          magi: grossIncome,
          netInvestmentIncome: taxableGrowth,
          filingStatus: 'single'  // KEY CHANGE
        })
      : { applies: false, taxAmount: 0, thresholdExcess: 0 };

    // IRMAA (65+)
    const irmaaResult = age >= 65
      ? calculateIRMAA({
          magi: grossIncome,
          filingStatus: 'single',  // KEY CHANGE
          hasPartD: true
        })
      : { tier: 0, monthlyPartB: 0, monthlyPartD: 0, annualSurcharge: 0 };

    const totalTax = federalResult.totalTax + stateResult.totalTax +
                     niitResult.taxAmount + irmaaResult.annualSurcharge;
    taxableBalance -= totalTax;

    results.push({
      year,
      age,
      spouseAge: null,  // No spouse
      traditionalBalance,
      rothBalance,
      taxableBalance,
      rmdAmount,
      conversionAmount: 0,  // Widow scenario is baseline-like (no conversions)
      ssIncome,
      pensionIncome,
      otherIncome,
      totalIncome: grossIncome,
      federalTax: federalResult.totalTax,
      stateTax: stateResult.totalTax,
      niitTax: niitResult.taxAmount,
      irmaaSurcharge: irmaaResult.annualSurcharge,
      totalTax,
      taxableSS: ssResult.taxableAmount,
      netWorth: traditionalBalance + rothBalance + taxableBalance
    });
  }

  return results;
}
