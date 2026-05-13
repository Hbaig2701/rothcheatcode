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

  // Marginal federal tax on the FULL IRA withdrawal for the year — computed
  // as tax(income_with_full_IRA_distribution) − tax(income_without_any_IRA
  // _distribution). Combines the conversion-attributable tax AND the tax
  // owed on the gross-up dollars (which the engine otherwise displays in
  // the "ordinary income" tax bucket because they're an additional taxable
  // distribution). Surfaced as the "Total Fed Tax on IRA Withdrawal"
  // column so advisors don't have to add two rows together to see the
  // real tax cost of pulling money out of the IRA. (Robert R., ticket
  // a1639792.)
  federalTaxOnIRAWithdrawal?: number;

  // Taxes paid from IRA: portion of IRA withdrawn to cover conversion taxes (in cents).
  // When the carrier penalty-free cap is active (respect_penalty_free_limit +
  // tax_payment_source = 'from_ira' + still in surrender period), this is
  // capped at penalty_free_percent × beginning-of-year IRA. Any conversion tax
  // above the cap goes to taxesPaidExternally (below) — the conversion itself
  // is unaffected because a Roth conversion is an intra-carrier transfer that
  // doesn't count against the carrier's penalty-free withdrawal allowance.
  taxesPaidFromIRA?: number;

  // Taxes paid from external/non-IRA funds for the conversion (in cents).
  // Populated when the carrier penalty-free cap binds in a from_ira scenario
  // — the IRA covers up to taxesPaidFromIRA, the rest of the conversion tax
  // is assumed paid by the client out of non-qualified cash. Zero whenever
  // the cap doesn't bind (toggle off, surrender period over, or
  // tax_payment_source = 'from_outside'). Surfaced in the dashboard tooltip
  // and story-mode card so the advisor sees exactly how much the client
  // wrote a check for. Doesn't reduce any tracked balance — it's modeled as
  // money the client funded externally.
  taxesPaidExternally?: number;

  // 10% early withdrawal penalty on IRA distributions used to pay conversion
  // taxes when client is under 59.5 (in cents). Assessed on the taxesPaidFromIRA
  // amount; paid from external funds, not from the IRA itself.
  earlyWithdrawalPenalty?: number;

  // Voluntary withdrawals from the IRA / Roth, scheduled by the advisor
  // (separate from RMDs and conversions). IRA portion adds to taxable income;
  // Roth portion is tax-free (assumed qualified). Both reduce the respective
  // balance. The pre-59.5 IRA penalty rolls into earlyWithdrawalPenalty above.
  iraWithdrawal?: number;
  rothWithdrawal?: number;

  // AUM split-allocation bucket fields. Populated by combineRothAndAum on
  // the COMBINED YearlyResult only (i.e. blueprint_years when a client has
  // aum_allocation_percent > 0). Undefined when AUM is off so the year-by-
  // year deep-dive table can hide these columns automatically.
  // - aumBalance: end-of-year balance of the managed brokerage portion
  //   (a SUBSET of taxableBalance, which is the combined Roth-side taxable +
  //   AUM brokerage)
  // - aumTransfer: this year's IRA-to-AUM pull (a SUBSET of iraWithdrawal,
  //   which combines AUM-engine transfers + advisor-scheduled voluntary IRA
  //   withdrawals — splitting these out keeps each column's meaning clean)
  // - aumTax: total AUM-side tax for the year (ordinary tax on the transfer
  //   + dividend drag + realized cap-gains turnover + 10% penalty if any).
  //   This is a SUBSET of totalTax — it's ALREADY counted in federalTax +
  //   stateTax + earlyWithdrawalPenalty on the combined row, so don't add
  //   it on top when computing lifetime tax cost.
  aumBalance?: number;
  aumTransfer?: number;
  aumTax?: number;

  // AUM brokerage spending withdrawal — the portion of the user's scheduled
  // `client.withdrawals` that the Roth-side engine couldn't satisfy (because
  // the IRA balance was reduced by `aum_allocation_percent`) and that the
  // AUM brokerage absorbed instead. Treated as a brokerage liquidation
  // (LTCG on the gain portion) rather than ordinary income — the qualified
  // tax was already paid during the IRA→AUM transfer, so charging ordinary
  // income on the same dollars again would double-count.
  // Populated by combineRothAndAum on the COMBINED row only. The dollar
  // amount is ALSO already reflected in the year's taxableBalance reduction
  // (the AUM bucket is a subset of taxableBalance), so don't add it on top
  // when computing balances. The companion tax line is in `aumTax` /
  // `totalTax`.
  aumScheduledWithdrawal?: number;

  // Guaranteed Income-specific (optional, for GI products)
  incomeRiderValue?: number; // Income benefit base (in cents)
  accumulationValue?: number; // Account accumulation value (in cents)
  incomePayoutAmount?: number; // Guaranteed income payout gross (in cents)
  riderFee?: number; // Annual rider fee (in cents)

  // Extended GI fields for adjustable columns on GI products
  // 'waiting' = baseline-only pre-purchase period; 'conversion' = strategy-only Roth conversion phase
  giPhase?: 'waiting' | 'conversion' | 'purchase' | 'deferral' | 'income';
  giIncomeNet?: number; // After-tax GI payment (cents) — equals gross for Roth/strategy
  giCumulativeIncome?: number; // Lifetime net GI income received to date (cents)
  giRollUpGrowth?: number; // Roll-up increment added to income base this year (cents)
  giPayoutRate?: number; // Payout rate used this year (percent, e.g. 6.60)
  giConversionTax?: number; // Tax paid during conversion phase (federal + state, cents)
}

export interface SimulationInput {
  client: Client;
  startYear: number;
  endYear: number;
  /**
   * If the client has a custom product attached (client.custom_product_id),
   * the loaded row goes here. The engine consults the resolver
   * (lib/calculations/resolvers/product-resolver.ts) which overlays this
   * config on top of the system preset for fields like roll-up rate, payout
   * factors, rider fee, and bonus targeting. When absent, engines fall back
   * to the system preset's tables.
   */
  customProduct?: import("@/lib/products/types").CustomProductRow | null;
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
