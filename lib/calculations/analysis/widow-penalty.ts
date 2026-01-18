import type { Client } from '@/lib/types/client';
import type { WidowTaxImpact, WidowAnalysisResult } from './types';
import { calculateFederalTax, calculateTaxableIncome } from '../modules/federal-tax';
import { getStandardDeduction } from '@/lib/data/standard-deductions';
import { runWidowScenario } from '../scenarios/widow';
import { runBaselineScenario } from '../scenarios/baseline';
import { adjustForInflation } from '../modules/inflation';

/**
 * Calculate tax impact for a single year of married vs widow filing
 * Shows the bracket shift penalty
 */
export function calculateWidowTaxImpact(input: {
  marriedIncome: number;    // Taxable income when married (cents)
  widowIncome: number;      // Taxable income as single (cents)
  year: number;
  marriedAge: number;
  spouseAge?: number;
}): WidowTaxImpact {
  const { marriedIncome, widowIncome, year, marriedAge, spouseAge } = input;

  // Get deductions for each status
  const marriedDeduction = getStandardDeduction(
    'married_filing_jointly',
    marriedAge,
    spouseAge
  );
  const singleDeduction = getStandardDeduction('single', marriedAge, undefined);

  // Calculate taxable income after deductions
  const marriedTaxableIncome = calculateTaxableIncome(marriedIncome, marriedDeduction);
  const singleTaxableIncome = calculateTaxableIncome(widowIncome, singleDeduction);

  // Calculate taxes
  const marriedTaxResult = calculateFederalTax({
    taxableIncome: marriedTaxableIncome,
    filingStatus: 'married_filing_jointly',
    taxYear: year,
  });

  const singleTaxResult = calculateFederalTax({
    taxableIncome: singleTaxableIncome,
    filingStatus: 'single',
    taxYear: year,
  });

  return {
    marriedTax: marriedTaxResult.totalTax,
    marriedBracket: marriedTaxResult.marginalBracket,
    singleTax: singleTaxResult.totalTax,
    singleBracket: singleTaxResult.marginalBracket,
    taxIncrease: singleTaxResult.totalTax - marriedTaxResult.totalTax,
    bracketJump: singleTaxResult.marginalBracket - marriedTaxResult.marginalBracket,
  };
}

/**
 * Default death year: Use older spouse's life expectancy or 15 years out
 */
function getDefaultDeathYear(client: Client): number {
  const currentYear = new Date().getFullYear();

  // If spouse DOB provided, use spouse's life expectancy (simplified: 85 years)
  if (client.spouse_dob) {
    const spouseBirthYear = new Date(client.spouse_dob).getFullYear();
    const spouseDeathYear = spouseBirthYear + 85;
    return Math.max(currentYear + 5, spouseDeathYear); // At least 5 years out
  }

  // Default: 15 years from now
  return currentYear + 15;
}

/**
 * Full widow's penalty analysis
 * Compares married baseline vs single-filer widow scenario
 */
export function analyzeWidowPenalty(
  client: Client,
  deathYear?: number
): WidowAnalysisResult {
  // Only applicable for married filers
  if (client.filing_status !== 'married_filing_jointly') {
    throw new Error('Widow analysis only applicable for married filing jointly');
  }

  const currentYear = new Date().getFullYear();
  const resolvedDeathYear = deathYear ?? getDefaultDeathYear(client);

  // Years from now to death
  const yearsToDeathYear = resolvedDeathYear - currentYear;
  const totalProjection = client.projection_years ?? 30;

  // Run pre-death as married (baseline scenario)
  const preDeathScenario = runBaselineScenario(
    client,
    currentYear,
    Math.min(yearsToDeathYear, totalProjection)
  );

  // Run post-death as single
  const postDeathYears = totalProjection - yearsToDeathYear;
  const postDeathScenario = postDeathYears > 0
    ? runWidowScenario({
        client,
        deathYear: resolvedDeathYear,
        projectionYears: postDeathYears,
      })
    : [];

  // Calculate tax impact year by year (post-death)
  const taxImpactByYear: WidowTaxImpact[] = [];
  let totalAdditionalTax = 0;
  const inflationRate = (client.inflation_rate ?? 2.5) / 100;

  for (let i = 0; i < postDeathScenario.length; i++) {
    const widowYear = postDeathScenario[i];
    const yearsFromNow = yearsToDeathYear + i;

    // Estimate what married income would have been (with spouse SS)
    const spouseSS = adjustForInflation(
      client.ss_spouse ?? 0,
      yearsFromNow,
      inflationRate
    );
    const estimatedMarriedIncome = widowYear.totalIncome + spouseSS;

    const impact = calculateWidowTaxImpact({
      marriedIncome: estimatedMarriedIncome,
      widowIncome: widowYear.totalIncome,
      year: widowYear.year,
      marriedAge: widowYear.age,
    });

    taxImpactByYear.push(impact);
    totalAdditionalTax += impact.taxIncrease;
  }

  // Calculate recommended conversion increase
  // Goal: Pre-convert enough to reduce traditional balance and RMDs
  // Rough heuristic: Increase conversion to fill single 22% bracket instead of 12%
  const avgBracketJump = taxImpactByYear.length > 0
    ? taxImpactByYear.reduce((sum, t) => sum + t.bracketJump, 0) / taxImpactByYear.length
    : 0;

  // Simplified: recommend converting enough to stay in current bracket
  // More sophisticated: would need to model optimal conversion amounts
  const recommendedIncrease = avgBracketJump > 5
    ? Math.round(totalAdditionalTax / postDeathScenario.length) // Spread tax prepayment
    : 0;

  return {
    deathYear: resolvedDeathYear,
    preDeathScenario,
    postDeathScenario,
    taxImpactByYear,
    totalAdditionalTax,
    recommendedConversionIncrease: recommendedIncrease,
  };
}
