import type { IRMAAResult } from '../types';
import {
  getIRMAATier,
  getIRMAASurcharge,
  calculateIRMAAHeadroom as getHeadroom,
  isNearIRMAACliff
} from '@/lib/data/irmaa-brackets';

export { isNearIRMAACliff };

/**
 * Input for IRMAA calculation
 */
export interface IRMAAInput {
  magi: number;           // Modified Adjusted Gross Income in cents
  filingStatus: string;   // Filing status
  year?: number;          // Tax year for threshold adjustments
  hasPartD?: boolean;     // Whether enrolled in Part D (legacy compatibility)
}

/**
 * Calculate Medicare IRMAA surcharge
 *
 * CRITICAL: IRMAA uses CLIFF thresholds - being $1 over triggers full tier
 * Note: IRMAA is based on MAGI from 2 years prior (lookback)
 *
 * Per specification, IRMAA only applies at age 65+ (Medicare eligibility)
 * The caller should check age before calling this function.
 */
export function calculateIRMAA(input: IRMAAInput): IRMAAResult {
  const isJoint = input.filingStatus === 'married_filing_jointly';
  const year = input.year ?? 2026;

  const tier = getIRMAATier(input.magi, isJoint, year);
  const annualSurcharge = getIRMAASurcharge(input.magi, isJoint, year);

  // For tier index, count from 0 (standard) upward
  const tierIndex = annualSurcharge === 0 ? 0 :
    annualSurcharge <= 84000 ? 1 :   // Single Tier 1
    annualSurcharge <= 210000 ? 2 :  // Single Tier 2
    annualSurcharge <= 336000 ? 3 :  // Single Tier 3
    annualSurcharge <= 462000 ? 4 :  // Single Tier 4
    5;                                // Single Tier 5

  return {
    tier: tierIndex,
    monthlyPartB: Math.round(tier.monthlyPartBSurcharge / 12), // Legacy compatibility
    monthlyPartD: 0, // Legacy compatibility
    annualSurcharge
  };
}

/**
 * Calculate how much room before hitting next IRMAA tier
 * @param magi MAGI in cents
 * @param filingStatus Filing status
 * @param year Tax year
 */
export function calculateIRMAAHeadroom(magi: number, filingStatus: string, year: number = 2026): number {
  const isJoint = filingStatus === 'married_filing_jointly';
  return getHeadroom(magi, isJoint, year);
}

/**
 * Calculate IRMAA for a lookback scenario
 * IRMAA is based on income from 2 years prior
 *
 * @param currentYear The current year
 * @param incomeHistory Map of year -> MAGI in cents
 * @param filingStatus Filing status
 */
export function calculateIRMAAWithLookback(
  currentYear: number,
  incomeHistory: Map<number, number>,
  filingStatus: string
): IRMAAResult {
  const lookbackYear = currentYear - 2;
  const lookbackMagi = incomeHistory.get(lookbackYear) ?? 0;

  return calculateIRMAA({
    magi: lookbackMagi,
    filingStatus,
    year: currentYear
  });
}

/**
 * Get IRMAA tier name for display
 */
export function getIRMAATierName(tierIndex: number): string {
  const tierNames = [
    'Standard',
    'Tier 1',
    'Tier 2',
    'Tier 3',
    'Tier 4',
    'Tier 5 (Highest)'
  ];
  return tierNames[tierIndex] ?? 'Unknown';
}
