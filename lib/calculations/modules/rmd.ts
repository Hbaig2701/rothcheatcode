import type { RMDInput, RMDResult } from '../types';
import { UNIFORM_LIFETIME_TABLE, getDistributionPeriod } from '@/lib/data/rmd-factors';
import { getRMDStartAge } from '../utils/age';

/**
 * Calculate Required Minimum Distribution
 * Uses SECURE 2.0 Act rules: RMD starts at 73 for birth years 1951-1959, 75 for 1960+
 */
export function calculateRMD(input: RMDInput): RMDResult {
  const rmdStartAge = getRMDStartAge(input.birthYear);

  // Not yet required to take RMD
  if (input.age < rmdStartAge) {
    return {
      rmdRequired: false,
      rmdAmount: 0,
      distributionPeriod: 0
    };
  }

  // Get distribution period from Uniform Lifetime Table
  const distributionPeriod = getDistributionPeriod(Math.min(input.age, 120));

  // RMD = Prior year-end balance / distribution period
  const rmdAmount = Math.round(input.traditionalBalance / distributionPeriod);

  return {
    rmdRequired: true,
    rmdAmount,
    distributionPeriod
  };
}
