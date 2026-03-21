/**
 * Tax Calculation Helper Functions
 *
 * Utilities for calculating tax-related fields that are displayed in adjustable columns
 * but not part of the core calculation logic.
 */

import type { FilingStatus } from './types';

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
 * Get standard deduction for a given filing status and ages
 *
 * @param filingStatus Filing status
 * @param age Primary taxpayer age
 * @param spouseAge Spouse age (if married filing jointly)
 * @param year Tax year (for inflation adjustments)
 * @returns Standard deduction in cents
 */
export function getStandardDeduction(
  filingStatus: FilingStatus,
  age: number,
  spouseAge: number | null,
  year: number = 2026
): number {
  // 2026 estimated values (2024 values inflated at ~3% per year)
  // Source: IRS Publication 17
  const baseDeduction =
    filingStatus === 'married_filing_jointly' ? 3100000 :  // $31,000
    filingStatus === 'single' ? 1550000 :                   // $15,500
    filingStatus === 'head_of_household' ? 2325000 :        // $23,250
    1550000; // Default to single

  // Additional deduction for age 65+
  const additionalOver65 =
    filingStatus === 'married_filing_jointly' ? 155000 :    // $1,550 per person
    195000;                                                   // $1,950 for single/HOH

  let deduction = baseDeduction;

  // Add additional for primary taxpayer if 65+
  if (age >= 65) {
    deduction += additionalOver65;
  }

  // Add additional for spouse if 65+ (married filing jointly only)
  if (filingStatus === 'married_filing_jointly' && spouseAge && spouseAge >= 65) {
    deduction += additionalOver65;
  }

  return deduction;
}

/**
 * Get marginal tax bracket for a given taxable income
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
  // 2026 estimated bracket rates (same as 2024 TCJA rates)
  const brackets = [0.10, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37];

  // 2026 estimated thresholds (2024 inflated at ~3% per year)
  const thresholds =
    filingStatus === 'married_filing_jointly' ?
      [0, 2460000, 10000000, 21310000, 40700000, 51700000, 77550000] :  // MFJ
    filingStatus === 'single' ?
      [0, 1230000, 5000000, 10655000, 20350000, 25850000, 38775000] :   // Single
    filingStatus === 'head_of_household' ?
      [0, 1755000, 7100000, 15175000, 21000000, 30000000, 52000000] :   // HOH
      [0, 1230000, 5000000, 10655000, 20350000, 25850000, 38775000];    // Default to single

  // Find the highest bracket reached
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (taxableIncome >= thresholds[i]) {
      return brackets[i] * 100; // Return as percentage (e.g., 22)
    }
  }

  return 10; // Minimum bracket is 10%
}

/**
 * Get IRMAA tier based on MAGI
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
  // 2026 estimated thresholds (2024 values inflated at 2.5% per year)
  // Source: Medicare.gov IRMAA tables
  const limits =
    filingStatus === 'married_filing_jointly' ?
      [20600000, 25800000, 32200000, 38600000, 75000000] :  // MFJ
      [10300000, 12900000, 16100000, 19300000, 50000000];   // Single/HOH

  // Return tier 0-5
  for (let i = 0; i < limits.length; i++) {
    if (magi < limits[i]) {
      return i;
    }
  }

  return 5; // Highest tier
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
