/**
 * Calculation Engine Types
 * All monetary values are in cents (integers) to avoid floating-point errors
 */

import type { Client } from "@/lib/types/client";

// Re-export FilingStatus from Client type
export type FilingStatus = Client["filing_status"];

// ============================================================
// Tax Bracket Types
// ============================================================

/**
 * Represents a single tax bracket
 * lower/upper are in cents, rate is a percentage (e.g., 22 for 22%)
 */
export interface TaxBracket {
  lower: number;
  upper: number; // Use Infinity for top bracket
  rate: number;
}

/**
 * Amount taxed at each bracket
 */
export interface BracketAmount {
  rate: number;
  amount: number; // In cents
}

// ============================================================
// Federal Tax Types
// ============================================================

export interface FederalTaxInput {
  taxableIncome: number; // In cents
  filingStatus: FilingStatus;
  taxYear: number;
}

export interface FederalTaxResult {
  totalTax: number; // In cents
  effectiveRate: number; // Percentage (e.g., 22.5)
  marginalBracket: number; // Top bracket rate hit
  bracketBreakdown: BracketAmount[];
}

// ============================================================
// RMD Types
// ============================================================

export interface RMDInput {
  age: number;
  traditionalBalance: number; // Prior year-end balance in cents
  birthYear: number;
}

export interface RMDResult {
  rmdRequired: boolean;
  rmdAmount: number; // In cents
  distributionPeriod: number;
}

// ============================================================
// NIIT Types (Net Investment Income Tax)
// ============================================================

export interface NIITInput {
  magi: number; // Modified AGI in cents
  netInvestmentIncome: number; // In cents
  filingStatus: FilingStatus;
}

export interface NIITResult {
  applies: boolean;
  taxAmount: number; // In cents
  thresholdExcess: number; // How much over threshold
}

// ============================================================
// Social Security Taxation Types
// ============================================================

export interface SSTaxInput {
  ssBenefits: number; // Total SS benefits in cents
  otherIncome: number; // AGI excluding SS in cents
  taxExemptInterest: number; // Municipal bond interest in cents
  filingStatus: FilingStatus;
}

export interface SSTaxResult {
  taxableAmount: number; // Taxable SS in cents
  taxablePercent: number; // 0, 50, or 85
  provisionalIncome: number; // For reference
}

// ============================================================
// IRMAA Types (Medicare Premium Surcharges)
// ============================================================

export interface IRMAAInput {
  magi: number; // MAGI from 2 years prior, in cents
  filingStatus: FilingStatus;
  hasPartD: boolean;
}

export interface IRMAAResult {
  tier: number; // 0 = standard, 1-5 = IRMAA tiers
  monthlyPartB: number; // In cents
  monthlyPartD: number; // In cents
  annualSurcharge: number; // Extra cost above standard, in cents
}

// ============================================================
// State Tax Types
// ============================================================

export interface StateTaxInput {
  taxableIncome: number; // In cents
  state: string; // 2-letter state code
  filingStatus: FilingStatus;
  overrideRate?: number; // Optional override rate as decimal (e.g., 0.05 for 5%)
}

export interface StateTaxResult {
  totalTax: number; // In cents
  effectiveRate: number; // Percentage
}

// ============================================================
// Simulation Types
// ============================================================

/**
 * Complete annual projection snapshot
 */
export interface YearlyResult {
  year: number;
  age: number;
  spouseAge: number | null;

  // Account balances (end of year, in cents)
  traditionalBalance: number;
  rothBalance: number;
  taxableBalance: number;

  // Income (in cents)
  rmdAmount: number;
  conversionAmount: number;
  ssIncome: number;
  pensionIncome: number;
  otherIncome: number;
  totalIncome: number;

  // Taxes (in cents)
  federalTax: number;
  stateTax: number;
  niitTax: number;
  irmaaSurcharge: number;
  totalTax: number;

  // Social Security taxation
  taxableSS: number;

  // Net worth (in cents)
  netWorth: number;

  // Surrender value (optional, only for Growth FIA products with surrender schedules)
  surrenderChargePercent?: number; // e.g., 16 for 16%
  surrenderValue?: number; // Account value after surrender charge (in cents)

  // Cumulative after-tax distributions (for 'spent' RMD treatment)
  // Only populated in baseline scenario when rmd_treatment = 'spent'
  cumulativeDistributions?: number;

  // ============================================================
  // Extended fields for adjustable column feature
  // ============================================================

  // Beginning of year balances (in cents)
  traditionalBOY?: number;
  rothBOY?: number;
  taxableBOY?: number;

  // Account growth/interest (in cents)
  traditionalGrowth?: number;
  rothGrowth?: number;
  taxableGrowth?: number;

  // Product-specific (Growth FIA)
  productBonusApplied?: number; // Annual bonus applied this year (in cents)

  // Tax calculation details (in cents except percentages)
  magi?: number; // Modified Adjusted Gross Income
  agi?: number; // Adjusted Gross Income
  standardDeduction?: number;
  taxableIncome?: number;
  federalTaxBracket?: number; // Marginal bracket as percentage (e.g., 22 for 22%)
  irmaaTier?: number; // 0-5 (0 = standard, 5 = highest)

  // Tax component breakdowns (in cents)
  federalTaxOnSS?: number;
  federalTaxOnConversions?: number;
  federalTaxOnOrdinaryIncome?: number;
  stateTaxOnSS?: number;
  stateTaxOnConversions?: number;
  stateTaxOnOrdinaryIncome?: number;

  // Total IRA withdrawal: conversion + taxes paid from IRA (in cents)
  totalIRAWithdrawal?: number;

  // Taxes paid from IRA: portion of IRA withdrawn to cover conversion taxes (in cents)
  taxesPaidFromIRA?: number;

  // 10% early withdrawal penalty on IRA distributions used to pay conversion
  // taxes when client is under 59.5 (in cents). Assessed on the taxesPaidFromIRA
  // amount; paid from external funds, not from the IRA itself.
  earlyWithdrawalPenalty?: number;

  // Guaranteed Income-specific (optional, for GI products)
  incomeRiderValue?: number; // Income benefit base (in cents)
  accumulationValue?: number; // Account accumulation value (in cents)
  incomePayoutAmount?: number; // Guaranteed income payout (in cents)
  riderFee?: number; // Annual rider fee (in cents)
}

export interface SimulationInput {
  client: Client;
  startYear: number;
  endYear: number;
}

export interface SimulationResult {
  baseline: YearlyResult[]; // No conversion scenario
  formula: YearlyResult[]; // Roth conversion scenario
  breakEvenAge: number | null; // Age when formula becomes beneficial
  totalTaxSavings: number; // Lifetime tax savings in cents
  heirBenefit: number; // Benefit to heirs in cents
}

// =============================================================================
// Multi-Strategy Comparison Types (Phase 06)
// =============================================================================

/**
 * The 4 supported Roth conversion strategies
 */
export type StrategyType = 'conservative' | 'moderate' | 'aggressive' | 'irmaa_safe';

/**
 * Comparison metrics for a single strategy
 * All currency values in cents
 */
export interface StrategyComparisonMetrics {
  endingWealth: number;        // Final year net worth (cents)
  taxSavings: number;          // Lifetime tax savings vs baseline (cents)
  breakEvenAge: number | null; // Age when Formula surpasses Baseline
  totalIRMAA: number;          // Total IRMAA surcharges paid (cents)
  heirBenefit: number;         // Tax benefit to heirs (cents)
  totalConversions: number;    // Sum of all conversions (cents)
}

/**
 * Result of running all 4 strategies
 */
export interface MultiStrategyResult {
  strategies: Record<StrategyType, SimulationResult>;
  bestStrategy: StrategyType;
  comparisonMetrics: Record<StrategyType, StrategyComparisonMetrics>;
}
