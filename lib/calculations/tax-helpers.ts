/**
 * Tax Calculation Helper Functions
 *
 * Utilities for calculating tax-related fields that are displayed in adjustable columns
 * but not part of the core calculation logic.
 */

import type { FilingStatus } from './types';
import { getFederalBrackets } from '@/lib/data/federal-brackets-2026';
import { getIRMAATier as getIRMAATierFromBrackets, getIRMAASurcharge } from '@/lib/data/irmaa-brackets';

/**
 * Calculate Modified Adjusted Gross Income (MAGI)
 *
 * For IRMAA purposes, MAGI = AGI + tax-exempt interest + excluded foreign income
 * In our simplified model: MAGI ≈ Total Income
 *
 * @param totalIncome Total income in cents
 * @param taxExemptInterest Tax-exempt interest (if any) in cents
 * @returns MAGI in cents
 */
export function calculateMAGI(
  totalIncome: number,
  taxExemptInterest: number = 0
): number {
  return totalIncome + taxExemptInterest;
}

/**
 * Get marginal tax bracket for a given taxable income
 *
 * Uses the same bracket data as the actual tax calculation engine
 * (federal-brackets-2026.ts) with inflation adjustment for future years.
 *
 * @param taxableIncome Taxable income in cents
 * @param filingStatus Filing status
 * @param year Tax year (for inflation adjustments)
 * @returns Marginal bracket rate as percentage (e.g., 22 for 22%)
 */
export function getMarginalBracket(
  taxableIncome: number,
  filingStatus: FilingStatus,
  year: number = 2026
): number {
  const brackets = getFederalBrackets(year, filingStatus);

  // Find the highest bracket reached
  for (let i = brackets.length - 1; i >= 0; i--) {
    if (taxableIncome > brackets[i].lower) {
      return brackets[i].rate;
    }
  }

  return brackets[0]?.rate ?? 10;
}

/**
 * Get IRMAA tier based on MAGI
 *
 * Uses the same bracket data as the actual IRMAA calculation engine
 * (irmaa-brackets.ts) with inflation adjustment for future years.
 *
 * @param magi Modified AGI in cents
 * @param filingStatus Filing status
 * @param year Tax year (for inflation adjustments)
 * @returns IRMAA tier (0 = standard premium, 1-5 = surcharge tiers)
 */
export function getIRMAATier(
  magi: number,
  filingStatus: FilingStatus,
  year: number = 2026
): number {
  const isJoint = filingStatus === 'married_filing_jointly';
  const tier = getIRMAATierFromBrackets(magi, isJoint, year);

  // Use the monthly Part B surcharge (same for single/joint) to identify tier index
  // Tier 0: $0, Tier 1: $70, Tier 2: $175, Tier 3: $280, Tier 4: $385, Tier 5: $420
  const surcharge = tier.monthlyPartBSurcharge;
  if (surcharge === 0) return 0;
  if (surcharge <= 7000) return 1;
  if (surcharge <= 17500) return 2;
  if (surcharge <= 28000) return 3;
  if (surcharge <= 38500) return 4;
  return 5;
}

/**
 * Calculate Adjusted Gross Income (AGI)
 *
 * AGI = Total Income - Above-the-line deductions
 * For simplicity in our model, AGI ≈ Total Income (no above-the-line deductions modeled)
 *
 * @param totalIncome Total income in cents
 * @returns AGI in cents
 */
export function calculateAGI(totalIncome: number): number {
  // In our simplified model, AGI = total income
  // In a more complex model, would subtract:
  // - HSA contributions
  // - Traditional IRA contributions (deductible portion)
  // - Student loan interest
  // - etc.
  return totalIncome;
}
