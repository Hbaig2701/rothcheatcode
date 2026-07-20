/**
 * Tax Calculation Helper Functions
 *
 * Utilities for calculating tax-related fields that are displayed in adjustable columns
 * but not part of the core calculation logic.
 */

import type { FilingStatus } from './types';
import { getFederalBrackets } from '@/lib/data/federal-brackets-2026';
import { getIRMAATierIndex, getIRMAASurcharge } from '@/lib/data/irmaa-brackets';
import { calculateSSTaxableAmount } from './modules/social-security';
import { getBracketCeiling, calculateFederalTax } from './modules/federal-tax';
import { calculateStateTax } from './modules/state-tax';
import { getSeniorBonusDeduction } from '@/lib/data/standard-deductions';

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
  // Age + tax year of the projection year, used to apply the OBBA senior
  // bonus deduction ($6k/person 65+, 2025–2028, phased out on MAGI). Required
  // so every taxable-income path applies it consistently — the senior
  // deduction is computed per-scenario here because its phase-out depends on
  // this scenario's AGI (a large conversion can phase it out).
  age: number;
  spouseAge?: number;
  taxYear: number;
}): {
  taxableSS: number;          // Portion of SS that becomes taxable (cents)
  agi: number;                // otherIncome + taxableSS (cents)
  taxableIncome: number;      // max(0, agi - deductions - seniorBonus) (cents)
  seniorBonusDeduction: number; // OBBA senior deduction applied (cents)
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
  // MAGI ≈ AGI (see getSeniorBonusDeduction). Computed from THIS scenario's
  // AGI so the phase-out tracks the conversion size.
  const seniorBonusDeduction = getSeniorBonusDeduction(
    params.filingStatus,
    agi,
    params.age,
    params.spouseAge,
    params.taxYear
  );
  const taxableIncome = Math.max(0, agi - params.deductions - seniorBonusDeduction);
  return {
    taxableSS: ssResult.taxableAmount,
    agi,
    taxableIncome,
    seniorBonusDeduction,
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
  age: number;               // projection-year age (for OBBA senior deduction)
  spouseAge?: number;
}): number {
  if (params.iraBalance <= 0) return 0;

  const ceiling = getBracketCeiling(params.filingStatus, params.maxBracketRate, params.taxYear);
  // Infinity = no upper bound (e.g., 37%+ rate) → convert everything.
  // Note: ceiling === 0 is a VALID case meaning "fill up to where taxable income = 0"
  // (i.e., convert just enough to stay under the standard deduction). The binary search
  // below handles it correctly. We must NOT short-circuit on ceiling===0 — that previously
  // caused max_tax_rate=0 to return the full IRA balance.
  if (ceiling === Infinity) return params.iraBalance;

  const taxableAt = (conversion: number) =>
    computeTaxableIncomeWithSS({
      otherIncome: params.otherIncome + conversion,
      ssBenefits: params.ssBenefits,
      taxExemptInterest: params.taxExemptInterest,
      deductions: params.deductions,
      filingStatus: params.filingStatus,
      age: params.age,
      spouseAge: params.spouseAge,
      taxYear: params.taxYear,
    }).taxableIncome;

  // If existing income alone STRICTLY EXCEEDS the ceiling, no room to convert.
  // Use strict > (not >=) so the ceiling=0 case allows a binary search when
  // taxableAt(0)=0 exactly (e.g., $0 other income + $30K standard deduction).
  if (taxableAt(0) > ceiling) return 0;
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
 * Plan an IRA withdrawal that simultaneously funds a Roth conversion AND
 * the tax owed on that conversion, when the client has opted to pay tax
 * FROM the IRA (a.k.a. "internal" tax payment).
 *
 * Key insight: when tax is withheld from the IRA itself, the withholding
 * is ALSO a taxable distribution on the 1099-R. So the year's taxable
 * income includes `conversion + tax_from_IRA`, not just `conversion`. The
 * bracket constraint therefore applies to the *total IRA withdrawal*, not
 * just the conversion portion.
 *
 * Algorithm:
 *   1. Let X = total IRA withdrawal. Find the largest X where
 *      `taxable_income(otherIncome + X, ssBenefits)` stays at or below the
 *      target bracket ceiling. This is exactly what
 *      `calculateSSAwareOptimalConversion` solves — the output is X, the
 *      maximum bracket-filling IRA distribution.
 *   2. Compute the marginal federal + state tax at that X (relative to no
 *      IRA withdrawal). This is the tax the custodian withholds.
 *   3. Split: conversion = X − marginalTax; tax_from_IRA = marginalTax.
 *
 * This produces self-consistent numbers: the 1099-R for X, the tax the
 * IRS actually computes on the year's return, and the money that ends up
 * in the Roth all reconcile without a cash shortfall.
 *
 * The previous approach — find max conversion C, then shrink by
 * `C × (1 − rate)` — under-reported tax by ~`C × rate²` because the
 * haircut didn't account for the tax payment itself being taxable.
 */
export function calculateSSAwareIRAWithdrawalPlan(params: {
  iraBalance: number;
  otherIncome: number;
  ssBenefits: number;
  taxExemptInterest: number;
  deductions: number;
  maxBracketRate: number;
  filingStatus: FilingStatus;
  taxYear: number;
  age: number;
  spouseAge?: number;
  state: string;
  stateTaxRateDecimal?: number;
}): {
  totalIRAWithdrawal: number;
  conversion: number;
  federalTaxFromIRA: number;
  stateTaxFromIRA: number;
  taxableSS: number;
} {
  // Step 1: find the max total IRA withdrawal that keeps taxable income
  // at or below the bracket ceiling. Same binary-search semantics as the
  // conversion optimizer — we just relabel the output.
  const totalIRAWithdrawal = calculateSSAwareOptimalConversion({
    iraBalance: params.iraBalance,
    otherIncome: params.otherIncome,
    ssBenefits: params.ssBenefits,
    taxExemptInterest: params.taxExemptInterest,
    deductions: params.deductions,
    maxBracketRate: params.maxBracketRate,
    filingStatus: params.filingStatus,
    taxYear: params.taxYear,
    age: params.age,
    spouseAge: params.spouseAge,
  });

  if (totalIRAWithdrawal <= 0) {
    return {
      totalIRAWithdrawal: 0,
      conversion: 0,
      federalTaxFromIRA: 0,
      stateTaxFromIRA: 0,
      taxableSS: 0,
    };
  }

  // Step 2: marginal federal + state tax at this withdrawal level.
  const noWithdrawal = computeTaxableIncomeWithSS({
    otherIncome: params.otherIncome,
    ssBenefits: params.ssBenefits,
    taxExemptInterest: params.taxExemptInterest,
    deductions: params.deductions,
    filingStatus: params.filingStatus,
    age: params.age,
    spouseAge: params.spouseAge,
    taxYear: params.taxYear,
  });
  const withWithdrawal = computeTaxableIncomeWithSS({
    otherIncome: params.otherIncome + totalIRAWithdrawal,
    ssBenefits: params.ssBenefits,
    taxExemptInterest: params.taxExemptInterest,
    deductions: params.deductions,
    filingStatus: params.filingStatus,
    age: params.age,
    spouseAge: params.spouseAge,
    taxYear: params.taxYear,
  });

  const fedNo = calculateFederalTax({
    taxableIncome: noWithdrawal.taxableIncome,
    filingStatus: params.filingStatus,
    taxYear: params.taxYear,
  }).totalTax;
  const fedWith = calculateFederalTax({
    taxableIncome: withWithdrawal.taxableIncome,
    filingStatus: params.filingStatus,
    taxYear: params.taxYear,
  }).totalTax;
  const stateNo = calculateStateTax({
    taxableIncome: noWithdrawal.taxableIncome,
    state: params.state,
    filingStatus: params.filingStatus,
    overrideRate: params.stateTaxRateDecimal,
  }).totalTax;
  const stateWith = calculateStateTax({
    taxableIncome: withWithdrawal.taxableIncome,
    state: params.state,
    filingStatus: params.filingStatus,
    overrideRate: params.stateTaxRateDecimal,
  }).totalTax;

  const federalTaxFromIRA = Math.max(0, fedWith - fedNo);
  const stateTaxFromIRA = Math.max(0, stateWith - stateNo);
  const conversion = Math.max(0, totalIRAWithdrawal - federalTaxFromIRA - stateTaxFromIRA);

  return {
    totalIRAWithdrawal,
    conversion,
    federalTaxFromIRA,
    stateTaxFromIRA,
    taxableSS: withWithdrawal.taxableSS,
  };
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
  age: number;
  spouseAge?: number;
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
    age: params.age,
    spouseAge: params.spouseAge,
    taxYear: params.taxYear,
  });
  const withConv = computeTaxableIncomeWithSS({
    otherIncome: params.otherIncome + params.conversionAmount,
    ssBenefits: params.ssBenefits,
    taxExemptInterest: params.taxExemptInterest,
    deductions: params.deductions,
    filingStatus: params.filingStatus,
    age: params.age,
    spouseAge: params.spouseAge,
    taxYear: params.taxYear,
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
  // Derive the tier index from the MAGI's threshold position — the canonical
  // source of truth in irmaa-brackets.ts. (The previous implementation
  // reverse-engineered the index from hardcoded monthly-surcharge dollar
  // thresholds that went stale when the CMS 2026 surcharges were corrected in
  // v71 — e.g. Tier 1's $81.20 surcharge no longer fit the old "≤ $70" bucket,
  // so every tier was reported one too high.)
  return getIRMAATierIndex(magi, isJoint, year);
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
