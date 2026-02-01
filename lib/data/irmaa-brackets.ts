/**
 * Medicare IRMAA surcharge tiers for 2026 (Estimated)
 * All monetary values in cents
 *
 * Source: Roth CheatCode Specification v1.0
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
 * 2026 IRMAA Thresholds and Surcharges
 * Thresholds increase ~2.5% annually for inflation per spec
 */
export const IRMAA_TIERS_2026: IRMAATier[] = [
  // Tier 0: Standard premium (no surcharge)
  {
    singleLower: 0,
    singleUpper: 10300000,          // $103,000
    jointLower: 0,
    jointUpper: 20600000,           // $206,000
    monthlyPartBSurcharge: 0,
    annualSurchargeSingle: 0,
    annualSurchargeCouple: 0
  },
  // Tier 1
  {
    singleLower: 10300000,          // $103,000
    singleUpper: 12900000,          // $129,000
    jointLower: 20600000,           // $206,000
    jointUpper: 25800000,           // $258,000
    monthlyPartBSurcharge: 7000,    // $70.00/month
    annualSurchargeSingle: 84000,   // $840/year
    annualSurchargeCouple: 168000   // $1,680/year
  },
  // Tier 2
  {
    singleLower: 12900000,          // $129,000
    singleUpper: 16100000,          // $161,000
    jointLower: 25800000,           // $258,000
    jointUpper: 32200000,           // $322,000
    monthlyPartBSurcharge: 17500,   // $175.00/month
    annualSurchargeSingle: 210000,  // $2,100/year
    annualSurchargeCouple: 420000   // $4,200/year
  },
  // Tier 3
  {
    singleLower: 16100000,          // $161,000
    singleUpper: 19300000,          // $193,000
    jointLower: 32200000,           // $322,000
    jointUpper: 38600000,           // $386,000
    monthlyPartBSurcharge: 28000,   // $280.00/month
    annualSurchargeSingle: 336000,  // $3,360/year
    annualSurchargeCouple: 672000   // $6,720/year
  },
  // Tier 4
  {
    singleLower: 19300000,          // $193,000
    singleUpper: 50000000,          // $500,000
    jointLower: 38600000,           // $386,000
    jointUpper: 75000000,           // $750,000
    monthlyPartBSurcharge: 38500,   // $385.00/month
    annualSurchargeSingle: 462000,  // $4,620/year
    annualSurchargeCouple: 924000   // $9,240/year
  },
  // Tier 5: Highest bracket
  {
    singleLower: 50000000,          // $500,000
    singleUpper: Infinity,
    jointLower: 75000000,           // $750,000
    jointUpper: Infinity,
    monthlyPartBSurcharge: 42000,   // $420.00/month
    annualSurchargeSingle: 504000,  // $5,040/year
    annualSurchargeCouple: 1008000  // $10,080/year
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
 * Calculate headroom to next IRMAA tier
 * Returns how much more MAGI can increase before hitting next tier
 */
export function calculateIRMAAHeadroom(magi: number, isJoint: boolean, year: number = 2026): number {
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

  for (const tier of adjustedTiers) {
    const threshold = isJoint ? tier.jointLower : tier.singleLower;
    if (threshold > magi) {
      return threshold - magi;
    }
  }
  return Infinity;
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
