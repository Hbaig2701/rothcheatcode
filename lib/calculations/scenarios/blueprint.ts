import type { Client } from '@/lib/types/client';
import type { YearlyResult } from '../types';
import { calculateAge, getAgeAtYearOffset, getBirthYearFromAge } from '../utils/age';
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
type ConversionType = 'optimized_amount' | 'fixed_amount' | 'full_conversion' | 'no_conversion';

const STRATEGY_CONFIG: Record<Strategy, { targetBracket: number; irmaaAvoidance: boolean; strictIRMAA?: boolean }> = {
  conservative: { targetBracket: 22, irmaaAvoidance: true },
  moderate: { targetBracket: 24, irmaaAvoidance: true },
  aggressive: { targetBracket: 32, irmaaAvoidance: false },
  irmaa_safe: { targetBracket: 24, irmaaAvoidance: true, strictIRMAA: true }
};

// Map conversion_type to strategy for config lookup
function getStrategyFromConversionType(conversionType: ConversionType | undefined, strategy?: Strategy): Strategy {
  if (strategy) return strategy;
  switch (conversionType) {
    case 'optimized_amount': return 'moderate';
    case 'fixed_amount': return 'conservative';
    case 'full_conversion': return 'aggressive';
    case 'no_conversion': return 'conservative';
    default: return 'moderate';
  }
}

function calculateConversionAmount(
  client: Client,
  age: number,
  year: number,
  currentTaxableIncome: number,
  traditionalBalance: number,
  grossIncome: number
): number {
  // Handle no_conversion type
  if (client.conversion_type === 'no_conversion') return 0;

  const effectiveStrategy = getStrategyFromConversionType(client.conversion_type, client.strategy as Strategy);
  const strategy = STRATEGY_CONFIG[effectiveStrategy];

  // Calculate start and end ages using new or legacy fields
  const startAge = client.age !== undefined
    ? client.age + (client.years_to_defer_conversion ?? 0)
    : client.start_age ?? 60;
  const endAge = client.end_age ?? 72;

  if (age < startAge || age > endAge) return 0;
  if (traditionalBalance <= 0) return 0;

  // Handle full conversion type
  if (client.conversion_type === 'full_conversion') {
    let maxConversion = traditionalBalance;
    if (client.tax_payment_source === 'from_ira') {
      const effectiveRate = strategy.targetBracket / 100;
      maxConversion = Math.round(maxConversion * (1 - effectiveRate));
    }
    return Math.max(0, maxConversion);
  }

  // Use tax_rate/max_tax_rate if available, otherwise use strategy target bracket
  const targetRate = client.max_tax_rate ?? strategy.targetBracket;
  const brackets = getFederalBrackets(year, client.filing_status);
  const targetBracket = brackets.find(b => b.rate === targetRate) ?? brackets.find(b => b.rate === strategy.targetBracket);
  if (!targetBracket) return 0;

  let headroom = targetBracket.upper - currentTaxableIncome;
  if (headroom <= 0) return 0;

  // IRMAA constraint
  const useIRMAAAvoidance = client.constraint_type === 'irmaa_threshold' || strategy.irmaaAvoidance || strategy.strictIRMAA;
  if (useIRMAAAvoidance) {
    const irmaaHeadroom = calculateIRMAAHeadroom(grossIncome, client.filing_status);
    if (client.constraint_type === 'irmaa_threshold' || strategy.strictIRMAA) {
      headroom = Math.min(headroom, irmaaHeadroom);
    }
  }

  let maxConversion = Math.min(headroom, traditionalBalance);

  // Gross up if paying tax from IRA
  if (client.tax_payment_source === 'from_ira') {
    const effectiveRate = targetRate / 100;
    maxConversion = Math.round(maxConversion * (1 - effectiveRate));
  }

  return Math.max(0, maxConversion);
}

/**
 * Run Blueprint scenario: strategic Roth conversions
 * Supports both legacy DOB-based approach and new age-based approach
 */
export function runBlueprintScenario(
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

  // Use new rate_of_return or legacy growth_rate
  const growthRate = (client.rate_of_return ?? client.growth_rate ?? 7) / 100;
  const inflationRate = (client.inflation_rate ?? 2.5) / 100;

  // Initial balances - support both new and legacy fields
  let traditionalBalance = client.qualified_account_value ?? client.traditional_ira ?? 0;
  let rothBalance = client.roth_ira ?? 0;
  let taxableBalance = client.taxable_accounts ?? 0;

  // Apply bonus if using insurance product
  if (client.bonus_percent && client.bonus_percent > 0) {
    const bonus = Math.round(traditionalBalance * (client.bonus_percent / 100));
    traditionalBalance += bonus;
  }

  for (let yearOffset = 0; yearOffset < projectionYears; yearOffset++) {
    const year = startYear + yearOffset;
    const age = useAgeBased ? getAgeAtYearOffset(clientAge, yearOffset) : calculateAge(client.date_of_birth!, year);
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
        // tax_exempt is not included in taxable calculations
      }
    } else {
      // Legacy approach
      pensionIncome = adjustForInflation(client.pension ?? 0, yearOffset, inflationRate);
      otherIncome = adjustForInflation(client.other_income ?? 0, yearOffset, inflationRate);
    }

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
