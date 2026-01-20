import type { Client } from '@/lib/types/client';
import type { YearlyResult } from '../types';
import { calculateAge, getAgeAtYearOffset, getBirthYearFromAge } from '../utils/age';
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
 * Supports both legacy DOB-based approach and new age-based approach
 */
export function runBaselineScenario(
  client: Client,
  startYear: number,
  projectionYears: number
): YearlyResult[] {
  const results: YearlyResult[] = [];

  // Determine if using new age-based approach or legacy DOB approach
  const useAgeBased = client.age !== undefined && client.age > 0;
  const clientAge = useAgeBased ? client.age : (client.date_of_birth ? calculateAge(client.date_of_birth, startYear) : 62);
  const birthYear = useAgeBased
    ? getBirthYearFromAge(clientAge, startYear)
    : (client.date_of_birth ? new Date(client.date_of_birth).getFullYear() : startYear - clientAge);

  // Use new rate fields or legacy fields
  // For baseline, use baseline_comparison_rate if available, otherwise growth_rate
  const growthRate = (client.baseline_comparison_rate ?? client.growth_rate ?? 7) / 100;
  const inflationRate = (client.inflation_rate ?? 2.5) / 100;

  // Initial balances - support both new and legacy fields
  let traditionalBalance = client.qualified_account_value ?? client.traditional_ira ?? 0;
  let rothBalance = client.roth_ira ?? 0;
  let taxableBalance = client.taxable_accounts ?? 0;

  // Note: Baseline does NOT apply insurance product bonus

  for (let yearOffset = 0; yearOffset < projectionYears; yearOffset++) {
    const year = startYear + yearOffset;
    const age = useAgeBased ? getAgeAtYearOffset(clientAge, yearOffset) : calculateAge(client.date_of_birth!, year);
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

    // SS income - support both new ssi_* fields and legacy ss_* fields
    const ssStartAge = client.ssi_payout_age ?? client.ss_start_age ?? 67;
    const annualSSI = client.ssi_annual_amount ?? ((client.ss_self ?? 0) + (client.ss_spouse ?? 0));
    const ssIncome = age >= ssStartAge
      ? adjustForInflation(annualSSI, yearOffset, inflationRate)
      : 0;

    // Other income from non_ssi_income or legacy fields
    let pensionIncome = 0;
    let otherIncome = 0;

    if (client.non_ssi_income && client.non_ssi_income.length > 0) {
      // Find matching entry for this year/age
      const incomeEntry = client.non_ssi_income.find(e => e.year === year || e.age === age);
      if (incomeEntry) {
        otherIncome = incomeEntry.gross_taxable;
      }
    } else {
      // Legacy approach
      pensionIncome = adjustForInflation(client.pension ?? 0, yearOffset, inflationRate);
      otherIncome = adjustForInflation(client.other_income ?? 0, yearOffset, inflationRate);
    }

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
