import type { NIITInput, NIITResult, FilingStatus } from '../types';

/**
 * NIIT thresholds in cents
 */
const NIIT_THRESHOLDS: Record<FilingStatus, number> = {
  single: 20000000,                    // $200,000
  married_filing_jointly: 25000000,    // $250,000
  married_filing_separately: 12500000, // $125,000
  head_of_household: 20000000          // $200,000
};

const NIIT_RATE = 0.038; // 3.8%

/**
 * Calculate Net Investment Income Tax (3.8% on investment income above thresholds)
 */
export function calculateNIIT(input: NIITInput): NIITResult {
  const threshold = NIIT_THRESHOLDS[input.filingStatus];

  // Below threshold: no NIIT
  if (input.magi <= threshold) {
    return {
      applies: false,
      taxAmount: 0,
      thresholdExcess: 0
    };
  }

  // Calculate excess over threshold
  const thresholdExcess = input.magi - threshold;

  // Tax applies to lesser of: net investment income OR excess over threshold
  const taxableAmount = Math.min(input.netInvestmentIncome, thresholdExcess);
  const taxAmount = Math.round(taxableAmount * NIIT_RATE);

  return {
    applies: true,
    taxAmount,
    thresholdExcess
  };
}
