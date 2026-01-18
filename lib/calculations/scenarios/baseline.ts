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

/**
 * Run Baseline scenario: no Roth conversions, just RMDs
 */
export function runBaselineScenario(
  client: Client,
  startYear: number,
  projectionYears: number
): YearlyResult[] {
  const results: YearlyResult[] = [];
  const birthYear = new Date(client.date_of_birth).getFullYear();
  const growthRate = (client.growth_rate ?? 6) / 100;
  const inflationRate = (client.inflation_rate ?? 2.5) / 100;

  let traditionalBalance = client.traditional_ira ?? 0;
  let rothBalance = client.roth_ira ?? 0;
  let taxableBalance = client.taxable_accounts ?? 0;

  for (let yearOffset = 0; yearOffset < projectionYears; yearOffset++) {
    const year = startYear + yearOffset;
    const age = calculateAge(client.date_of_birth, year);
    const spouseAge = client.spouse_dob ? calculateAge(client.spouse_dob, year) : null;

    // Apply growth
    traditionalBalance += Math.round(traditionalBalance * growthRate);
    rothBalance += Math.round(rothBalance * growthRate);
    const taxableGrowth = Math.round(taxableBalance * growthRate);
    taxableBalance += taxableGrowth;

    // Calculate RMD
    const rmdResult = calculateRMD({ age, traditionalBalance, birthYear });
    const rmdAmount = rmdResult.rmdAmount;
    traditionalBalance -= rmdAmount;

    // Social Security
    const ssStartAge = client.ss_start_age ?? 67;
    const ssIncome = age >= ssStartAge
      ? adjustForInflation((client.ss_self ?? 0) + (client.ss_spouse ?? 0), yearOffset, inflationRate)
      : 0;

    // Other income
    const pensionIncome = adjustForInflation(client.pension ?? 0, yearOffset, inflationRate);
    const otherIncome = adjustForInflation(client.other_income ?? 0, yearOffset, inflationRate);

    // SS taxation
    const ssResult = calculateSSTaxableAmount({
      ssBenefits: ssIncome,
      otherIncome: rmdAmount + pensionIncome + otherIncome,
      taxExemptInterest: 0,
      filingStatus: client.filing_status
    });

    // Gross income
    const grossIncome = rmdAmount + ssResult.taxableAmount + pensionIncome + otherIncome;

    // Deductions
    const deductions = getStandardDeduction(client.filing_status, age, spouseAge ?? undefined);
    const taxableIncome = calculateTaxableIncome(grossIncome, deductions);

    // Federal tax
    const federalResult = calculateFederalTax({
      taxableIncome,
      filingStatus: client.filing_status,
      taxYear: year
    });

    // State tax
    const stateResult = calculateStateTax({
      taxableIncome,
      state: client.state,
      filingStatus: client.filing_status
    });

    // NIIT
    const niitResult = client.include_niit
      ? calculateNIIT({ magi: grossIncome, netInvestmentIncome: taxableGrowth, filingStatus: client.filing_status })
      : { applies: false, taxAmount: 0, thresholdExcess: 0 };

    // IRMAA (65+)
    const irmaaResult = age >= 65
      ? calculateIRMAA({ magi: grossIncome, filingStatus: client.filing_status, hasPartD: true })
      : { tier: 0, monthlyPartB: 0, monthlyPartD: 0, annualSurcharge: 0 };

    const totalTax = federalResult.totalTax + stateResult.totalTax + niitResult.taxAmount + irmaaResult.annualSurcharge;
    taxableBalance -= totalTax;

    results.push({
      year,
      age,
      spouseAge,
      traditionalBalance,
      rothBalance,
      taxableBalance,
      rmdAmount,
      conversionAmount: 0,
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
