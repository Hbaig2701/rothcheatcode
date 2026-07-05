/**
 * Medicare IRMAA surcharge tiers for 2026 (Estimated)
 * All monetary values in cents
 *
 * Source: Retirement Expert Specification v1.0
 *
 * IRMAA (Income-Related Monthly Adjustment Amount) is a Medicare Part B/D
 * surcharge based on income from 2 years prior (lookback).
 */

export interface IRMAATier {
  singleLower: number;
  singleUpper: number;
  jointLower: number;
  jointUpper: number;
  monthlyPartBSurcharge: number;    // Per-person monthly surcharge (not base premium)
  annualSurchargeSingle: number;    // Annual surcharge for single filer
  annualSurchargeCouple: number;    // Annual surcharge for married couple
}

/**
 * 2026 IRMAA Thresholds and Surcharges — actual CMS-published figures.
 *
 * Source: CMS "2026 Medicare Parts A & B Premiums and Deductibles" fact sheet
 * (cms.gov, Nov 2025) + SSA POMS HI 01101.020. 2026 standard Part B premium is
 * $202.90/mo; the surcharge = (tier total premium − standard). Based on 2024
 * MAGI (2-year lookback). Thresholds increase ~2.5%/yr for inflation past 2026.
 */
export const IRMAA_TIERS_2026: IRMAATier[] = [
  // Tier 0: Standard premium (no surcharge) — total $202.90/mo
  {
    singleLower: 0,
    singleUpper: 10900000,          // $109,000
    jointLower: 0,
    jointUpper: 21800000,           // $218,000
    monthlyPartBSurcharge: 0,
    annualSurchargeSingle: 0,
    annualSurchargeCouple: 0
  },
  // Tier 1 — total $284.10/mo
  {
    singleLower: 10900000,          // $109,000
    singleUpper: 13700000,          // $137,000
    jointLower: 21800000,           // $218,000
    jointUpper: 27400000,           // $274,000
    monthlyPartBSurcharge: 8120,    // $81.20/month
    annualSurchargeSingle: 97440,   // $974.40/year
    annualSurchargeCouple: 194880   // $1,948.80/year
  },
  // Tier 2 — total $405.80/mo
  {
    singleLower: 13700000,          // $137,000
    singleUpper: 17100000,          // $171,000
    jointLower: 27400000,           // $274,000
    jointUpper: 34200000,           // $342,000
    monthlyPartBSurcharge: 20290,   // $202.90/month
    annualSurchargeSingle: 243480,  // $2,434.80/year
    annualSurchargeCouple: 486960   // $4,869.60/year
  },
  // Tier 3 — total $527.50/mo
  {
    singleLower: 17100000,          // $171,000
    singleUpper: 20500000,          // $205,000
    jointLower: 34200000,           // $342,000
    jointUpper: 41000000,           // $410,000
    monthlyPartBSurcharge: 32460,   // $324.60/month
    annualSurchargeSingle: 389520,  // $3,895.20/year
    annualSurchargeCouple: 779040   // $7,790.40/year
  },
  // Tier 4 — total $649.20/mo
  {
    singleLower: 20500000,          // $205,000
    singleUpper: 50000000,          // $500,000
    jointLower: 41000000,           // $410,000
    jointUpper: 75000000,           // $750,000
    monthlyPartBSurcharge: 44630,   // $446.30/month
    annualSurchargeSingle: 535560,  // $5,355.60/year
    annualSurchargeCouple: 1071120  // $10,711.20/year
  },
  // Tier 5: Highest bracket — total $689.90/mo
  {
    singleLower: 50000000,          // $500,000
    singleUpper: Infinity,
    jointLower: 75000000,           // $750,000
    jointUpper: Infinity,
    monthlyPartBSurcharge: 48700,   // $487.00/month
    annualSurchargeSingle: 584400,  // $5,844.00/year
    annualSurchargeCouple: 1168800  // $11,688.00/year
  }
];

// 2.5% annual inflation rate for IRMAA thresholds per specification
const IRMAA_INFLATION_RATE = 0.025;

/**
 * Get the IRMAA tier for a given MAGI and filing status
 * @param magi Modified Adjusted Gross Income in cents
 * @param isJoint Whether filing jointly
 * @param year Tax year (for inflation adjustment to thresholds)
 */
export function getIRMAATier(magi: number, isJoint: boolean, year: number = 2026): IRMAATier {
  // Adjust thresholds for inflation if year > 2026
  let adjustedTiers = IRMAA_TIERS_2026;
  if (year > 2026) {
    const yearsFromBase = year - 2026;
    const inflationFactor = Math.pow(1 + IRMAA_INFLATION_RATE, yearsFromBase);
    adjustedTiers = IRMAA_TIERS_2026.map(tier => ({
      ...tier,
      singleLower: Math.round(tier.singleLower * inflationFactor / 100) * 100,
      singleUpper: tier.singleUpper === Infinity ? Infinity : Math.round(tier.singleUpper * inflationFactor / 100) * 100,
      jointLower: Math.round(tier.jointLower * inflationFactor / 100) * 100,
      jointUpper: tier.jointUpper === Infinity ? Infinity : Math.round(tier.jointUpper * inflationFactor / 100) * 100
    }));
  }

  for (let i = adjustedTiers.length - 1; i >= 0; i--) {
    const tier = adjustedTiers[i];
    const lowerThreshold = isJoint ? tier.jointLower : tier.singleLower;
    if (magi >= lowerThreshold) {
      return tier;
    }
  }
  return adjustedTiers[0];
}

/**
 * Get the annual IRMAA surcharge for a given MAGI
 * @param magi MAGI in cents
 * @param isJoint Whether filing jointly
 * @param year Tax year
 */
export function getIRMAASurcharge(magi: number, isJoint: boolean, year: number = 2026): number {
  const tier = getIRMAATier(magi, isJoint, year);
  return isJoint ? tier.annualSurchargeCouple : tier.annualSurchargeSingle;
}

/**
 * Tier INDEX (0 = Standard … 5 = highest) for a given MAGI + filing status.
 * Derived from the threshold position — NOT reverse-engineered from the
 * surcharge dollar amount (which is fragile and mislabels joint filers, whose
 * surcharge is 2× the single amount).
 */
export function getIRMAATierIndex(magi: number, isJoint: boolean, year: number = 2026): number {
  const adjustedTiers = getAdjustedTiers(year);
  for (let i = adjustedTiers.length - 1; i >= 0; i--) {
    const lower = isJoint ? adjustedTiers[i].jointLower : adjustedTiers[i].singleLower;
    if (magi >= lower) return i;
  }
  return 0;
}

/**
 * Internal helper: return the inflation-adjusted tier list for a given year.
 * Shared by every threshold lookup so the inflation logic only lives in one
 * place.
 */
function getAdjustedTiers(year: number): IRMAATier[] {
  if (year <= 2026) return IRMAA_TIERS_2026;
  const inflationFactor = Math.pow(1 + IRMAA_INFLATION_RATE, year - 2026);
  return IRMAA_TIERS_2026.map(tier => ({
    ...tier,
    singleLower: Math.round(tier.singleLower * inflationFactor / 100) * 100,
    singleUpper: tier.singleUpper === Infinity ? Infinity : Math.round(tier.singleUpper * inflationFactor / 100) * 100,
    jointLower: Math.round(tier.jointLower * inflationFactor / 100) * 100,
    jointUpper: tier.jointUpper === Infinity ? Infinity : Math.round(tier.jointUpper * inflationFactor / 100) * 100,
  }));
}

/**
 * Calculate headroom to next IRMAA tier
 * Returns how much more MAGI can increase before hitting next tier
 */
export function calculateIRMAAHeadroom(magi: number, isJoint: boolean, year: number = 2026): number {
  const adjustedTiers = getAdjustedTiers(year);
  for (const tier of adjustedTiers) {
    const threshold = isJoint ? tier.jointLower : tier.singleLower;
    if (threshold > magi) {
      return threshold - magi;
    }
  }
  return Infinity;
}

/**
 * Calculate headroom from current MAGI to the TOP of a specific target tier
 * (i.e., to the threshold where the next tier starts).
 *
 * Tier indices:
 *   0 = Standard (no surcharge)
 *   1 = Tier 1
 *   2 = Tier 2
 *   3 = Tier 3
 *   4 = Tier 4
 *   5 = Tier 5 (highest, no upper bound — returns Infinity)
 *
 * Return value semantics:
 *   - Positive: headroom remaining; conversion can fill up to that much
 *     without crossing into a higher tier than the advisor's selection.
 *   - Negative: MAGI is already past the top of the target tier — the
 *     advisor's selection is infeasible for this year. Callers should
 *     auto-clamp (fall back to current-tier headroom) so the constraint
 *     becomes "don't make it worse" rather than "convert nothing" or
 *     "ignore the constraint entirely."
 *   - Infinity: target is Tier 5 (no upper bound). Effectively "no IRMAA
 *     cap" for this advisor selection.
 *
 * Inflation: thresholds are 2.5% inflation-indexed past 2026, same logic
 * as calculateIRMAAHeadroom.
 */
export function calculateIRMAAHeadroomToTarget(
  magi: number,
  isJoint: boolean,
  targetTier: number,
  year: number = 2026,
): number {
  // Clamp the target so a bad input value (or a stale DB row from before
  // the field existed) can never index out of bounds. 0 (Standard) is the
  // safest default — most conservative IRMAA position.
  const clampedTarget = Math.max(0, Math.min(IRMAA_TIERS_2026.length - 1, Math.round(targetTier)));
  const adjustedTiers = getAdjustedTiers(year);
  const tier = adjustedTiers[clampedTarget];
  const targetUpper = isJoint ? tier.jointUpper : tier.singleUpper;
  if (targetUpper === Infinity) return Infinity;
  return targetUpper - magi;
}

/**
 * Check if MAGI is near an IRMAA cliff
 */
export function isNearIRMAACliff(
  magi: number,
  isJoint: boolean,
  margin: number = 500000, // $5,000 default
  year: number = 2026
): { nearCliff: boolean; nextThreshold: number; amountToCliff: number } {
  const headroom = calculateIRMAAHeadroom(magi, isJoint, year);

  if (headroom === Infinity) {
    return { nearCliff: false, nextThreshold: Infinity, amountToCliff: Infinity };
  }

  return {
    nearCliff: headroom <= margin,
    nextThreshold: magi + headroom,
    amountToCliff: headroom
  };
}
