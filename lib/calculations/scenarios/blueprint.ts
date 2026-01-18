import type { Client } from '@/lib/types/client';
import type { YearlyResult } from '../types';
import { calculateAge } from '../utils/age';
import { calculateRMD } from '../modules/rmd';
import { calculateFederalTax, calculateTaxableIncome } from '../modules/federal-tax';
import { calculateStateTax } from '../modules/state-tax';
import { calculateSSTaxableAmount } from '../modules/social-security';
import { calculateNIIT } from '../modules/niit';
import { calculateIRMAA, calculateIRMAAHeadroom } from '../modules/irmaa';
import { adjustForInflation } from '../modules/inflation';
import { getStandardDeduction } from '@/lib/data/standard-deductions';
import { getFederalBrackets } from '@/lib/data/federal-brackets-2026';

type Strategy = 'conservative' | 'moderate' | 'aggressive' | 'irmaa_safe';

const STRATEGY_CONFIG: Record<Strategy, { targetBracket: number; irmaaAvoidance: boolean; strictIRMAA?: boolean }> = {
  conservative: { targetBracket: 22, irmaaAvoidance: true },
  moderate: { targetBracket: 24, irmaaAvoidance: true },
  aggressive: { targetBracket: 32, irmaaAvoidance: false },
  irmaa_safe: { targetBracket: 24, irmaaAvoidance: true, strictIRMAA: true }
};

function calculateConversionAmount(
  client: Client,
  age: number,
  year: number,
  currentTaxableIncome: number,
  traditionalBalance: number,
  grossIncome: number
): number {
  const strategy = STRATEGY_CONFIG[(client.strategy as Strategy) ?? 'moderate'];
  const startAge = client.start_age ?? 60;
  const endAge = client.end_age ?? 72;

  if (age < startAge || age > endAge) return 0;
  if (traditionalBalance <= 0) return 0;

  const brackets = getFederalBrackets(year, client.filing_status);
  const targetBracket = brackets.find(b => b.rate === strategy.targetBracket);
  if (!targetBracket) return 0;

  let headroom = targetBracket.upper - currentTaxableIncome;
  if (headroom <= 0) return 0;

  // IRMAA constraint
  if (strategy.irmaaAvoidance || strategy.strictIRMAA) {
    const irmaaHeadroom = calculateIRMAAHeadroom(grossIncome, client.filing_status);
    if (strategy.strictIRMAA) {
      headroom = Math.min(headroom, irmaaHeadroom);
    }
  }

  let maxConversion = Math.min(headroom, traditionalBalance);

  // Gross up if paying tax from IRA
  if (client.tax_payment_source === 'from_ira') {
    const effectiveRate = strategy.targetBracket / 100;
    maxConversion = Math.round(maxConversion * (1 - effectiveRate));
  }

  return Math.max(0, maxConversion);
}

/**
 * Run Blueprint scenario: strategic Roth conversions
 */
export function runBlueprintScenario(
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

    // Calculate RMD first
    const rmdResult = calculateRMD({ age, traditionalBalance, birthYear });
    const rmdAmount = rmdResult.rmdAmount;
    traditionalBalance -= rmdAmount;

    // SS and other income
    const ssStartAge = client.ss_start_age ?? 67;
    const ssIncome = age >= ssStartAge
      ? adjustForInflation((client.ss_self ?? 0) + (client.ss_spouse ?? 0), yearOffset, inflationRate)
      : 0;
    const pensionIncome = adjustForInflation(client.pension ?? 0, yearOffset, inflationRate);
    const otherIncome = adjustForInflation(client.other_income ?? 0, yearOffset, inflationRate);

    // Pre-conversion income
    const ssResult = calculateSSTaxableAmount({
      ssBenefits: ssIncome,
      otherIncome: rmdAmount + pensionIncome + otherIncome,
      taxExemptInterest: 0,
      filingStatus: client.filing_status
    });

    const preConversionGross = rmdAmount + ssResult.taxableAmount + pensionIncome + otherIncome;
    const deductions = getStandardDeduction(client.filing_status, age, spouseAge ?? undefined);
    const preConversionTaxable = calculateTaxableIncome(preConversionGross, deductions);

    // Calculate conversion amount
    const conversionAmount = calculateConversionAmount(
      client, age, year, preConversionTaxable, traditionalBalance, preConversionGross
    );

    // Execute conversion
    traditionalBalance -= conversionAmount;
    rothBalance += conversionAmount;

    // Recalculate with conversion
    const grossIncome = preConversionGross + conversionAmount;
    const taxableIncome = preConversionTaxable + conversionAmount;

    const federalResult = calculateFederalTax({ taxableIncome, filingStatus: client.filing_status, taxYear: year });
    const stateResult = calculateStateTax({ taxableIncome, state: client.state, filingStatus: client.filing_status });

    const niitResult = client.include_niit
      ? calculateNIIT({ magi: grossIncome, netInvestmentIncome: taxableGrowth, filingStatus: client.filing_status })
      : { applies: false, taxAmount: 0, thresholdExcess: 0 };

    const irmaaResult = age >= 65
      ? calculateIRMAA({ magi: grossIncome, filingStatus: client.filing_status, hasPartD: true })
      : { tier: 0, monthlyPartB: 0, monthlyPartD: 0, annualSurcharge: 0 };

    const totalTax = federalResult.totalTax + stateResult.totalTax + niitResult.taxAmount + irmaaResult.annualSurcharge;

    // Pay taxes
    if (client.tax_payment_source === 'from_ira') {
      // Already accounted for in conversion
    } else {
      taxableBalance -= totalTax;
    }

    results.push({
      year,
      age,
      spouseAge,
      traditionalBalance,
      rothBalance,
      taxableBalance,
      rmdAmount,
      conversionAmount,
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
