/**
 * Tax Calculation Helper Functions
 *
 * Utilities for calculating tax-related fields that are displayed in adjustable columns
 * but not part of the core calculation logic.
 */

import type { FilingStatus } from './types';
import { getFederalBrackets } from '@/lib/data/federal-brackets-2026';
import { getIRMAATier as getIRMAATierFromBrackets, getIRMAASurcharge } from '@/lib/data/irmaa-brackets';
import { calculateSSTaxableAmount } from './modules/social-security';
import { getBracketCeiling, calculateFederalTax } from './modules/federal-tax';
import { calculateStateTax } from './modules/state-tax';

/**
 * Compute taxable income correctly accounting for Social Security taxation
 * ("tax torpedo"). Up to 85% of SS becomes taxable once provisional income
 * exceeds the applicable MFJ/single thresholds.
 *
 * This is the single source of truth for taxable-income computation across
 * all engines. Do NOT compute `max(0, otherIncome - deductions)` directly
 * in the scenario engines — it silently treats SS as tax-exempt and produces
 * conversion recommendations that over-fill the target bracket.
 */
export function computeTaxableIncomeWithSS(params: {
  otherIncome: number;        // RMD + conversion + pension + wages + etc. (cents)
  ssBenefits: number;         // Annual SS benefits before taxation (cents)
  taxExemptInterest: number;  // Municipal bond interest (included in provisional) (cents)
  deductions: number;         // Standard or itemized deduction (cents)
  filingStatus: FilingStatus;
}): {
  taxableSS: number;          // Portion of SS that becomes taxable (cents)
  agi: number;                // otherIncome + taxableSS (cents)
  taxableIncome: number;      // max(0, agi - deductions) (cents)
  provisionalIncome: number;
  ssTaxablePercent: number;   // 0, 50, or 85
} {
  const ssResult = calculateSSTaxableAmount({
    ssBenefits: params.ssBenefits,
    otherIncome: params.otherIncome,
    taxExemptInterest: params.taxExemptInterest,
    filingStatus: params.filingStatus,
  });
  const agi = params.otherIncome + ssResult.taxableAmount;
  const taxableIncome = Math.max(0, agi - params.deductions);
  return {
    taxableSS: ssResult.taxableAmount,
    agi,
    taxableIncome,
    provisionalIncome: ssResult.provisionalIncome,
    ssTaxablePercent: ssResult.taxablePercent,
  };
}

/**
 * Find the Roth conversion amount that fills up to the target federal bracket
 * ceiling while correctly accounting for the Social Security tax torpedo.
 *
 * As the conversion grows, more of the client's SS becomes taxable (up to 85%),
 * which consumes bracket space. A naive "ceiling − existing taxable income"
 * calculation (the previous simplified model) over-converts, pushing clients
 * into higher brackets than promised. This binary search solves for the
 * largest conversion X such that:
 *
 *     taxableIncome(otherIncome + X, ssBenefits) ≤ bracket ceiling
 *
 * Converges in ≤⌈log2(iraBalance)⌉ iterations (< 40 for any realistic IRA).
 */
export function calculateSSAwareOptimalConversion(params: {
  iraBalance: number;
  otherIncome: number;       // Non-SS, non-conversion income (cents)
  ssBenefits: number;
  taxExemptInterest: number;
  deductions: number;
  maxBracketRate: number;    // e.g. 12
  filingStatus: FilingStatus;
  taxYear: number;
}): number {
  if (params.iraBalance <= 0) return 0;

  const ceiling = getBracketCeiling(params.filingStatus, params.maxBracketRate, params.taxYear);
  if (ceiling === 0 || ceiling === Infinity) return params.iraBalance;

  const taxableAt = (conversion: number) =>
    computeTaxableIncomeWithSS({
      otherIncome: params.otherIncome + conversion,
      ssBenefits: params.ssBenefits,
      taxExemptInterest: params.taxExemptInterest,
      deductions: params.deductions,
      filingStatus: params.filingStatus,
    }).taxableIncome;

  // If existing income alone already exceeds the ceiling, no room to convert.
  if (taxableAt(0) >= ceiling) return 0;
  // If converting the entire IRA still keeps us under the ceiling, convert all.
  if (taxableAt(params.iraBalance) <= ceiling) return params.iraBalance;

  let lo = 0;
  let hi = params.iraBalance;
  // Binary search for the largest conversion where taxable income stays ≤ ceiling.
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (taxableAt(mid) <= ceiling) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Marginal federal + state tax attributable to a Roth conversion, computed as
 * the DELTA between the year's tax with the conversion and without it. This
 * correctly captures extra tax from any additional SS that becomes taxable
 * when the conversion pushes provisional income higher.
 *
 * Use this instead of `calculateConversionFederalTax` in any scenario where
 * the client may have Social Security income.
 */
export function calculateConversionTaxWithSS(params: {
  conversionAmount: number;
  otherIncome: number;
  ssBenefits: number;
  taxExemptInterest: number;
  deductions: number;
  filingStatus: FilingStatus;
  taxYear: number;
  state: string;
  stateTaxRateDecimal?: number;
}): { federalTax: number; stateTax: number } {
  if (params.conversionAmount <= 0) return { federalTax: 0, stateTax: 0 };

  const noConv = computeTaxableIncomeWithSS({
    otherIncome: params.otherIncome,
    ssBenefits: params.ssBenefits,
    taxExemptInterest: params.taxExemptInterest,
    deductions: params.deductions,
    filingStatus: params.filingStatus,
  });
  const withConv = computeTaxableIncomeWithSS({
    otherIncome: params.otherIncome + params.conversionAmount,
    ssBenefits: params.ssBenefits,
    taxExemptInterest: params.taxExemptInterest,
    deductions: params.deductions,
    filingStatus: params.filingStatus,
  });

  const fedNoConv = calculateFederalTax({
    taxableIncome: noConv.taxableIncome,
    filingStatus: params.filingStatus,
    taxYear: params.taxYear,
  }).totalTax;
  const fedWithConv = calculateFederalTax({
    taxableIncome: withConv.taxableIncome,
    filingStatus: params.filingStatus,
    taxYear: params.taxYear,
  }).totalTax;

  const stateNoConv = calculateStateTax({
    taxableIncome: noConv.taxableIncome,
    state: params.state,
    filingStatus: params.filingStatus,
    overrideRate: params.stateTaxRateDecimal,
  }).totalTax;
  const stateWithConv = calculateStateTax({
    taxableIncome: withConv.taxableIncome,
    state: params.state,
    filingStatus: params.filingStatus,
    overrideRate: params.stateTaxRateDecimal,
  }).totalTax;

  return {
    federalTax: Math.max(0, fedWithConv - fedNoConv),
    stateTax: Math.max(0, stateWithConv - stateNoConv),
  };
}

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
