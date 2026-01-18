import type { SSTaxInput, SSTaxResult, FilingStatus } from '../types';

/**
 * Social Security taxation thresholds (in cents)
 * NOTE: These thresholds have NOT been inflation-adjusted since 1984/1993
 */
const SS_THRESHOLDS: Record<string, { lower: number; upper: number }> = {
  married_filing_jointly: { lower: 3200000, upper: 4400000 },  // $32k / $44k
  married_filing_separately: { lower: 0, upper: 0 },           // 85% from $0
  single: { lower: 2500000, upper: 3400000 },                  // $25k / $34k
  head_of_household: { lower: 2500000, upper: 3400000 }        // $25k / $34k
};

const BASE_AMOUNTS: Record<string, number> = {
  married_filing_jointly: 600000,  // $6,000
  single: 450000,                  // $4,500
  head_of_household: 450000
};

/**
 * Calculate taxable portion of Social Security benefits
 * The "tax torpedo" effect: each $1 of other income can make up to $0.85 of SS taxable
 */
export function calculateSSTaxableAmount(input: SSTaxInput): SSTaxResult {
  // Step 1: Calculate provisional income
  const provisionalIncome =
    input.otherIncome +
    input.taxExemptInterest +
    Math.round(input.ssBenefits / 2);

  // Get thresholds for filing status
  const thresholds = SS_THRESHOLDS[input.filingStatus] ?? SS_THRESHOLDS.single;

  // Below lower threshold: 0% taxable
  if (provisionalIncome <= thresholds.lower) {
    return { taxableAmount: 0, taxablePercent: 0, provisionalIncome };
  }

  // Between lower and upper: up to 50% taxable
  if (provisionalIncome <= thresholds.upper) {
    const excess = provisionalIncome - thresholds.lower;
    const taxable = Math.min(
      Math.round(excess * 0.5),
      Math.round(input.ssBenefits * 0.5)
    );
    return { taxableAmount: taxable, taxablePercent: 50, provisionalIncome };
  }

  // Above upper threshold: up to 85% taxable
  const baseAmount = BASE_AMOUNTS[input.filingStatus] ?? BASE_AMOUNTS.single;
  const fiftyPercentOfSS = Math.round(input.ssBenefits * 0.5);
  const lesserAmount = Math.min(baseAmount, fiftyPercentOfSS);

  const excess85 = provisionalIncome - thresholds.upper;
  const fromExcess = Math.round(excess85 * 0.85);

  const taxable = Math.min(
    fromExcess + lesserAmount,
    Math.round(input.ssBenefits * 0.85)
  );

  return { taxableAmount: taxable, taxablePercent: 85, provisionalIncome };
}
