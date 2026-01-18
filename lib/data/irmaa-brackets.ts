/**
 * Medicare IRMAA surcharge tiers for 2026
 * All monetary values in cents
 */

export interface IRMAATier {
  singleLower: number;
  singleUpper: number;
  jointLower: number;
  jointUpper: number;
  partBMonthly: number;
  partDMonthly: number;
}

// 2026 IRMAA thresholds (projected based on 2025 + inflation)
export const IRMAA_TIERS_2026: IRMAATier[] = [
  // Tier 0: Standard premium (no surcharge)
  {
    singleLower: 0,
    singleUpper: 10600000,      // $106,000
    jointLower: 0,
    jointUpper: 21200000,       // $212,000
    partBMonthly: 18500,        // $185.00
    partDMonthly: 0
  },
  // Tier 1
  {
    singleLower: 10600000,
    singleUpper: 13300000,      // $133,000
    jointLower: 21200000,
    jointUpper: 26600000,       // $266,000
    partBMonthly: 25920,        // $259.20
    partDMonthly: 1320          // $13.20
  },
  // Tier 2
  {
    singleLower: 13300000,
    singleUpper: 16700000,      // $167,000
    jointLower: 26600000,
    jointUpper: 33400000,       // $334,000
    partBMonthly: 37000,        // $370.00
    partDMonthly: 3410          // $34.10
  },
  // Tier 3
  {
    singleLower: 16700000,
    singleUpper: 20000000,      // $200,000
    jointLower: 33400000,
    jointUpper: 40000000,       // $400,000
    partBMonthly: 48080,        // $480.80
    partDMonthly: 5500          // $55.00
  },
  // Tier 4
  {
    singleLower: 20000000,
    singleUpper: 50000000,      // $500,000
    jointLower: 40000000,
    jointUpper: 75000000,       // $750,000
    partBMonthly: 59160,        // $591.60
    partDMonthly: 7590          // $75.90
  },
  // Tier 5: Highest bracket
  {
    singleLower: 50000000,
    singleUpper: Infinity,
    jointLower: 75000000,
    jointUpper: Infinity,
    partBMonthly: 62830,        // $628.30
    partDMonthly: 8110          // $81.10
  }
];

/**
 * Get the IRMAA tier for a given MAGI and filing status
 */
export function getIRMAATier(magi: number, isJoint: boolean): IRMAATier {
  for (let i = IRMAA_TIERS_2026.length - 1; i >= 0; i--) {
    const tier = IRMAA_TIERS_2026[i];
    const lowerThreshold = isJoint ? tier.jointLower : tier.singleLower;
    if (magi >= lowerThreshold) {
      return tier;
    }
  }
  return IRMAA_TIERS_2026[0];
}

/**
 * Check if MAGI is near an IRMAA cliff
 */
export function isNearIRMAACliff(
  magi: number,
  isJoint: boolean,
  margin: number = 500000 // $5,000 default
): { nearCliff: boolean; nextThreshold: number; amountToCliff: number } {
  for (const tier of IRMAA_TIERS_2026) {
    const threshold = isJoint ? tier.jointLower : tier.singleLower;
    if (threshold > magi) {
      const amountToCliff = threshold - magi;
      return {
        nearCliff: amountToCliff <= margin,
        nextThreshold: threshold,
        amountToCliff
      };
    }
  }
  return { nearCliff: false, nextThreshold: Infinity, amountToCliff: Infinity };
}
