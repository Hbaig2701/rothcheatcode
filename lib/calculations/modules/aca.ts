import { getFPL, getACASubsidyCutoff } from '@/lib/data/federal-poverty';
import { getApplicablePercentage, getEstimatedBenchmark } from '@/lib/data/aca-percentages';

interface ACAInput {
  magi: number;
  householdSize: number;
  state: string;
  age: number;
}

interface ACAResult {
  affectsACA: boolean;
  atSubsidyCliff: boolean;
  fplPercent: number;
  subsidyCutoff: number;
}

/**
 * Check if client is at ACA subsidy cliff (400% FPL)
 * Only applies to pre-Medicare clients (under 65)
 */
export function checkACACliff(input: ACAInput): ACAResult {
  // Medicare eligible - ACA doesn't apply
  if (input.age >= 65) {
    return {
      affectsACA: false,
      atSubsidyCliff: false,
      fplPercent: 0,
      subsidyCutoff: 0
    };
  }

  const fpl = getFPL(input.householdSize, input.state);
  const subsidyCutoff = getACASubsidyCutoff(input.householdSize, input.state);
  const fplPercent = (input.magi / fpl) * 100;

  return {
    affectsACA: true,
    atSubsidyCliff: input.magi > subsidyCutoff,
    fplPercent,
    subsidyCutoff
  };
}

/**
 * Calculate impact of Roth conversion on ACA subsidy
 */
export function calculateACAImpact(
  baseMAGI: number,
  conversionAmount: number,
  householdSize: number,
  state: string
): { crossesCliff: boolean; estimatedLoss: number } {
  const cutoff = getACASubsidyCutoff(householdSize, state);
  const newMAGI = baseMAGI + conversionAmount;

  const crossesCliff = baseMAGI <= cutoff && newMAGI > cutoff;

  // Rough estimate: $8,000-$15,000/year subsidy loss for a couple
  const estimatedLoss = crossesCliff ? 1200000 : 0; // $12,000 estimate

  return { crossesCliff, estimatedLoss };
}

// ============================================================
// Enhanced ACA Subsidy Calculations (Phase 08)
// ============================================================

/**
 * Detailed subsidy calculation result
 */
export interface ACASubsidyResult {
  eligible: boolean;            // Under 65, income in range
  fplPercent: number;           // Income as % of FPL
  applicablePercent: number | null; // Required contribution %
  expectedContribution: number; // What household should pay (cents)
  benchmarkPremium: number;     // Estimated SLCSP (cents)
  subsidyAmount: number;        // Benchmark - contribution (cents)
  isAtCliff: boolean;           // Above 400% in 2026+
  year: number;
}

/**
 * Calculate actual ACA subsidy amount
 * Uses applicable percentage table for precise calculation
 */
export function calculateACASubsidy(input: {
  magi: number;           // cents
  householdSize: number;
  state: string;
  age: number;
  year: number;
  isCouple?: boolean;
}): ACASubsidyResult {
  const { magi, householdSize, state, age, year, isCouple = false } = input;

  // Medicare eligible - no ACA
  if (age >= 65) {
    return {
      eligible: false,
      fplPercent: 0,
      applicablePercent: null,
      expectedContribution: 0,
      benchmarkPremium: 0,
      subsidyAmount: 0,
      isAtCliff: false,
      year,
    };
  }

  const fpl = getFPL(householdSize, state);
  const fplPercent = (magi / fpl) * 100;
  const applicablePercent = getApplicablePercentage(fplPercent, year);

  // Above cliff (2026+ only - returns null)
  if (applicablePercent === null) {
    return {
      eligible: true,
      fplPercent,
      applicablePercent: null,
      expectedContribution: 0,
      benchmarkPremium: getEstimatedBenchmark(age, isCouple),
      subsidyAmount: 0,
      isAtCliff: true,
      year,
    };
  }

  // Calculate expected contribution and subsidy
  const expectedContribution = Math.round(magi * (applicablePercent / 100));
  const benchmarkPremium = getEstimatedBenchmark(age, isCouple);
  const subsidyAmount = Math.max(0, benchmarkPremium - expectedContribution);

  return {
    eligible: true,
    fplPercent,
    applicablePercent,
    expectedContribution,
    benchmarkPremium,
    subsidyAmount,
    isAtCliff: false,
    year,
  };
}

/**
 * Calculate conversion impact on subsidy
 * Returns change in subsidy amount due to conversion
 */
export function calculateConversionSubsidyImpact(input: {
  baseMAGI: number;       // MAGI without conversion (cents)
  conversionAmount: number;
  householdSize: number;
  state: string;
  age: number;
  year: number;
  isCouple?: boolean;
}): {
  beforeSubsidy: number;
  afterSubsidy: number;
  subsidyLoss: number;
  crossesCliff: boolean;
} {
  const { baseMAGI, conversionAmount, ...rest } = input;

  const before = calculateACASubsidy({ magi: baseMAGI, ...rest });
  const after = calculateACASubsidy({ magi: baseMAGI + conversionAmount, ...rest });

  return {
    beforeSubsidy: before.subsidyAmount,
    afterSubsidy: after.subsidyAmount,
    subsidyLoss: before.subsidyAmount - after.subsidyAmount,
    crossesCliff: !before.isAtCliff && after.isAtCliff,
  };
}
