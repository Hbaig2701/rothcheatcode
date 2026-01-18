import type { IRMAAInput, IRMAAResult } from '../types';
import { IRMAA_TIERS_2026, getIRMAATier, isNearIRMAACliff } from '@/lib/data/irmaa-brackets';

export { isNearIRMAACliff };

/**
 * Calculate Medicare IRMAA surcharge
 * CRITICAL: IRMAA uses CLIFF thresholds - being $1 over triggers full tier
 * Note: IRMAA is based on MAGI from 2 years prior
 */
export function calculateIRMAA(input: IRMAAInput): IRMAAResult {
  const isJoint = input.filingStatus === 'married_filing_jointly';
  const tier = getIRMAATier(input.magi, isJoint);
  const tierIndex = IRMAA_TIERS_2026.indexOf(tier);

  const standardPartB = IRMAA_TIERS_2026[0].partBMonthly;
  const monthlyPartD = input.hasPartD ? tier.partDMonthly : 0;

  // Annual surcharge = extra Part B + Part D, times 12 months
  const annualSurcharge = ((tier.partBMonthly - standardPartB) + monthlyPartD) * 12;

  return {
    tier: tierIndex,
    monthlyPartB: tier.partBMonthly,
    monthlyPartD,
    annualSurcharge
  };
}

/**
 * Calculate how much room before hitting next IRMAA tier
 */
export function calculateIRMAAHeadroom(magi: number, filingStatus: string): number {
  const isJoint = filingStatus === 'married_filing_jointly';
  const { amountToCliff } = isNearIRMAACliff(magi, isJoint, Infinity);
  return amountToCliff;
}
