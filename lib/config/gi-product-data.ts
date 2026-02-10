/**
 * Guaranteed Income Product Data
 *
 * Product-specific configuration for the 4 GI products:
 * - Payout tables (age 55-80, single + joint)
 * - Roll-up configs (simple/compound, tiered rates)
 * - Rider fee configuration
 * - Bonus routing (incomeBase, accountValue, or null)
 *
 * This file is consumed by the GI calculation engine.
 * It does NOT modify any Growth product logic.
 */

import type { GuaranteedIncomeFormulaType } from './products';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Payout percentages keyed by age (55-80) */
export type PayoutByAge = Record<number, number>;

/** Standard payout table: single + joint */
export interface StandardPayoutTable {
  single: PayoutByAge;
  joint: PayoutByAge;
}

/** North American has level + increasing, each with single + joint */
export interface DualPayoutTable {
  level: StandardPayoutTable;
  increasing: StandardPayoutTable;
}

export type PayoutTable = StandardPayoutTable | DualPayoutTable;

/** A tiered rate entry: rate applies for years[0] through years[1] */
export interface RollUpTier {
  years: [number, number];
  rate: number; // Percentage (e.g. 10 = 10%)
}

/** Roll-up option the user can choose (American Equity) */
export interface RollUpOption {
  id: string;
  label: string;
  type: 'simple' | 'compound';
  rate: number;       // Percentage
  maxPeriod: number;  // Years
}

/** Roll-up configuration - either fixed tiers or user-selectable options */
export interface RollUpConfig {
  /** 'simple' or 'compound' - used for fixed configs */
  type?: 'simple' | 'compound';
  /** Fixed tiered rates (Athene, EquiTrust) */
  rates?: RollUpTier[];
  /** Single fixed rate (North American) */
  rate?: number;
  /** Max deferral period for roll-up */
  maxPeriod: number;
  /** User-selectable options (American Equity) */
  options?: RollUpOption[];
  /** Default option id when options are present */
  defaultOption?: string;
}

export interface GIProductData {
  /** Where the bonus is applied */
  bonusAppliesTo: 'incomeBase' | 'accountValue' | 'both' | null;
  /** Annual rider fee percentage (e.g. 1.00 = 1.00%) */
  riderFee: number;
  /** What the rider fee is calculated on */
  riderFeeAppliesTo: 'incomeBase' | 'accountValue';
  /** Roll-up configuration */
  rollUp: RollUpConfig;
  /** Payout percentage table */
  payoutTable: PayoutTable;
  /** Whether the product has a dual payout option (level/increasing) */
  hasDualPayoutOption: boolean;
  /** Whether the product has selectable roll-up options */
  hasRollUpOptions: boolean;
  /** Human-readable roll-up description */
  rollUpDescription: string;
  /** Annual increase rate for "increasing" LPA option (North American) */
  increasingLPARate?: number;
}

// ---------------------------------------------------------------------------
// Product Data
// ---------------------------------------------------------------------------

export const GI_PRODUCT_DATA: Record<GuaranteedIncomeFormulaType, GIProductData> = {
  // =========================================================================
  // Athene Ascent Pro 10
  // =========================================================================
  'athene-ascent-pro-10': {
    bonusAppliesTo: 'incomeBase',
    riderFee: 1.00,
    riderFeeAppliesTo: 'incomeBase',
    rollUp: {
      type: 'simple',
      rates: [
        { years: [1, 10], rate: 10 },
        { years: [11, 20], rate: 5 },
      ],
      maxPeriod: 20,
    },
    payoutTable: {
      single: {
        55: 3.60, 56: 3.70, 57: 3.80, 58: 3.90, 59: 4.00,
        60: 4.10, 61: 4.20, 62: 4.30, 63: 4.40, 64: 4.50,
        65: 4.10, 66: 4.20, 67: 4.30, 68: 4.40, 69: 4.50,
        70: 4.60, 71: 4.70, 72: 4.80, 73: 4.90, 74: 5.00,
        75: 5.10, 76: 5.20, 77: 5.30, 78: 5.40, 79: 5.50, 80: 5.60,
      },
      joint: {
        55: 3.10, 56: 3.20, 57: 3.30, 58: 3.40, 59: 3.50,
        60: 3.60, 61: 3.70, 62: 3.80, 63: 3.90, 64: 4.00,
        65: 3.60, 66: 3.70, 67: 3.80, 68: 3.90, 69: 4.00,
        70: 4.10, 71: 4.20, 72: 4.30, 73: 4.40, 74: 4.50,
        75: 4.60, 76: 4.70, 77: 4.80, 78: 4.90, 79: 5.00, 80: 5.10,
      },
    },
    hasDualPayoutOption: false,
    hasRollUpOptions: false,
    rollUpDescription: '10% Simple (yrs 1-10), 5% Simple (yrs 11-20)',
  },

  // =========================================================================
  // American Equity IncomeShield Bonus 10
  // Per spec: 14% bonus to BOTH Account Value AND IAV
  // Hardcoded to Option 4: 8.25% simple interest, 10 years, 1.20% rider fee
  // Includes Wellbeing Benefit (income doubler for health events)
  // =========================================================================
  'american-equity-incomeshield-bonus-10': {
    bonusAppliesTo: 'both', // 14% bonus applies to BOTH Account Value AND Income Account Value
    riderFee: 1.20, // Rider fee calculated on IAV, deducted from Account Value
    riderFeeAppliesTo: 'incomeBase',
    rollUp: {
      type: 'simple', // Option 4: Simple interest (not compound)
      rate: 8.25, // 8.25% per year
      maxPeriod: 10, // Maximum 10 years of roll-up
    },
    payoutTable: {
      single: {
        // Option 4 (Fee-based) payout factors - ages 50-80+
        50: 4.54, 51: 4.66, 52: 4.79, 53: 4.93, 54: 5.06,
        55: 5.19, 56: 5.33, 57: 5.48, 58: 5.62, 59: 5.76,
        60: 5.90, 61: 6.04, 62: 6.18, 63: 6.32, 64: 6.46,
        65: 6.60, 66: 6.74, 67: 6.86, 68: 7.00, 69: 7.14,
        70: 7.25, 71: 7.37, 72: 7.48, 73: 7.61, 74: 7.72,
        75: 7.85, 76: 7.94, 77: 8.04, 78: 8.16, 79: 8.28, 80: 8.40,
      },
      joint: {
        50: 3.97, 51: 4.08, 52: 4.22, 53: 4.36, 54: 4.48,
        55: 4.62, 56: 4.76, 57: 4.91, 58: 5.05, 59: 5.19,
        60: 5.33, 61: 5.47, 62: 5.61, 63: 5.75, 64: 5.89,
        65: 6.03, 66: 6.17, 67: 6.29, 68: 6.43, 69: 6.57,
        70: 6.68, 71: 6.80, 72: 6.91, 73: 7.04, 74: 7.15,
        75: 7.28, 76: 7.37, 77: 7.47, 78: 7.58, 79: 7.69, 80: 7.80,
      },
    },
    hasDualPayoutOption: false,
    hasRollUpOptions: false, // Option 4 is hardcoded - no user selection
    rollUpDescription: '8.25% Simple Interest (10yr max)',
  },

  // =========================================================================
  // EquiTrust MarketEarly Income Index
  // =========================================================================
  'equitrust-marketearly-income-index': {
    bonusAppliesTo: 'incomeBase',
    riderFee: 1.25,
    riderFeeAppliesTo: 'accountValue',
    rollUp: {
      type: 'compound',
      rates: [
        { years: [1, 5], rate: 7 },
        { years: [6, 10], rate: 4 },
      ],
      maxPeriod: 10,
    },
    payoutTable: {
      single: {
        55: 5.60, 56: 5.70, 57: 5.80, 58: 5.90, 59: 6.00,
        60: 6.10, 61: 6.20, 62: 6.30, 63: 6.40, 64: 6.50,
        65: 6.60, 66: 6.70, 67: 6.80, 68: 6.90, 69: 7.00,
        70: 7.10, 71: 7.20, 72: 7.30, 73: 7.40, 74: 7.50,
        75: 7.60, 76: 7.70, 77: 7.80, 78: 7.90, 79: 8.00, 80: 8.10,
      },
      joint: {
        55: 4.60, 56: 4.70, 57: 4.80, 58: 4.90, 59: 5.00,
        60: 5.10, 61: 5.20, 62: 5.30, 63: 5.40, 64: 5.50,
        65: 5.60, 66: 5.70, 67: 5.80, 68: 5.90, 69: 6.00,
        70: 6.10, 71: 6.20, 72: 6.30, 73: 6.40, 74: 6.50,
        75: 6.60, 76: 6.70, 77: 6.80, 78: 6.90, 79: 7.00, 80: 7.10,
      },
    },
    hasDualPayoutOption: false,
    hasRollUpOptions: false,
    rollUpDescription: '7% Compound (yrs 1-5), 4% Compound (yrs 6-10)',
  },

  // =========================================================================
  // North American Income Pay Pro
  // Per spec: No bonus, 8% compound roll-up (highest in industry), 1.15% rider fee
  // =========================================================================
  'north-american-income-pay-pro': {
    bonusAppliesTo: null,
    riderFee: 1.15,
    riderFeeAppliesTo: 'incomeBase', // Fee calculated on GLWB Value, deducted from Accumulation Value
    rollUp: {
      type: 'compound',
      rate: 8,
      maxPeriod: 10,
    },
    payoutTable: {
      level: {
        single: {
          // Ages 50-55 all get 5.80% per spec
          50: 5.80, 51: 5.80, 52: 5.80, 53: 5.80, 54: 5.80, 55: 5.80,
          56: 5.90, 57: 6.00, 58: 6.10, 59: 6.20,
          60: 6.30, 61: 6.40, 62: 6.50, 63: 6.60, 64: 6.70,
          65: 6.80, 66: 6.90, 67: 7.00, 68: 7.10, 69: 7.20,
          70: 7.30, 71: 7.40, 72: 7.50, 73: 7.60, 74: 7.70,
          75: 7.80, 76: 7.90, 77: 8.00, 78: 8.10, 79: 8.20, 80: 8.30,
        },
        joint: {
          50: 5.30, 51: 5.30, 52: 5.30, 53: 5.30, 54: 5.30, 55: 5.30,
          56: 5.40, 57: 5.50, 58: 5.60, 59: 5.70,
          60: 5.80, 61: 5.90, 62: 6.00, 63: 6.10, 64: 6.20,
          65: 6.30, 66: 6.40, 67: 6.50, 68: 6.60, 69: 6.70,
          70: 6.80, 71: 6.90, 72: 7.00, 73: 7.10, 74: 7.20,
          75: 7.30, 76: 7.40, 77: 7.50, 78: 7.60, 79: 7.70, 80: 7.80,
        },
      },
      increasing: {
        single: {
          50: 3.80, 51: 3.80, 52: 3.80, 53: 3.80, 54: 3.80, 55: 3.80,
          56: 3.90, 57: 4.00, 58: 4.10, 59: 4.20,
          60: 4.30, 61: 4.40, 62: 4.50, 63: 4.60, 64: 4.70,
          65: 4.80, 66: 4.90, 67: 5.00, 68: 5.10, 69: 5.20,
          70: 5.30, 71: 5.40, 72: 5.50, 73: 5.60, 74: 5.70,
          75: 5.80, 76: 5.90, 77: 6.00, 78: 6.10, 79: 6.20, 80: 6.30,
        },
        joint: {
          50: 3.30, 51: 3.30, 52: 3.30, 53: 3.30, 54: 3.30, 55: 3.30,
          56: 3.40, 57: 3.50, 58: 3.60, 59: 3.70,
          60: 3.80, 61: 3.90, 62: 4.00, 63: 4.10, 64: 4.20,
          65: 4.30, 66: 4.40, 67: 4.50, 68: 4.60, 69: 4.70,
          70: 4.80, 71: 4.90, 72: 5.00, 73: 5.10, 74: 5.20,
          75: 5.30, 76: 5.40, 77: 5.50, 78: 5.60, 79: 5.70, 80: 5.80,
        },
      },
    },
    hasDualPayoutOption: true,
    hasRollUpOptions: false,
    rollUpDescription: '8% Compound (10yr)',
    // Increasing LPA annual increase rate (per spec: currently ~2%, minimum 0.25%)
    increasingLPARate: 2.0,
  },
};

// ---------------------------------------------------------------------------
// Helper: Look up payout percentage
// ---------------------------------------------------------------------------

/**
 * Get payout percentage for a given age, payout type, and optionally payout option.
 * Returns the percentage as a decimal (e.g. 0.066 for 6.60%).
 */
export function getProductPayoutFactor(
  productId: GuaranteedIncomeFormulaType,
  payoutType: 'individual' | 'joint',
  age: number,
  payoutOption: 'level' | 'increasing' = 'level'
): number {
  const product = GI_PRODUCT_DATA[productId];
  if (!product) return 0.05; // fallback

  const tableKey = payoutType === 'individual' ? 'single' : 'joint';

  if (product.hasDualPayoutOption) {
    const dualTable = product.payoutTable as DualPayoutTable;
    const optionTable = dualTable[payoutOption];
    // North American supports ages 50-80
    const clampedAge = Math.min(Math.max(age, 50), 80);
    return (optionTable[tableKey][clampedAge] ?? 5.0) / 100;
  }

  const standardTable = product.payoutTable as StandardPayoutTable;
  // Check if product supports age 50 (American Equity does, others start at 55)
  const minAge = (50 in standardTable.single) ? 50 : 55;
  const clampedAge = Math.min(Math.max(age, minAge), 80);
  return (standardTable[tableKey][clampedAge] ?? 5.0) / 100;
}

/**
 * Get the annual increase rate for "increasing" LPA option.
 * Returns the rate as a decimal (e.g. 0.02 for 2%).
 */
export function getIncreasingLPARate(productId: GuaranteedIncomeFormulaType): number {
  const product = GI_PRODUCT_DATA[productId];
  return (product?.increasingLPARate ?? 0) / 100;
}

// ---------------------------------------------------------------------------
// Helper: Get roll-up rate for a given deferral year
// ---------------------------------------------------------------------------

/**
 * Get the roll-up rate and type for a given deferral year.
 * Returns { rate (decimal), type, isActive } or null if past maxPeriod.
 */
export function getRollUpForYear(
  productId: GuaranteedIncomeFormulaType,
  deferralYear: number,
  rollUpOption: 'simple' | 'compound' | null = null
): { rate: number; type: 'simple' | 'compound'; maxPeriod: number } | null {
  const product = GI_PRODUCT_DATA[productId];
  if (!product) return null;

  const config = product.rollUp;

  // User-selectable options (American Equity)
  if (config.options) {
    const selectedId = rollUpOption ?? config.defaultOption ?? config.options[0].id;
    const selected = config.options.find(o => o.id === selectedId) ?? config.options[0];
    if (deferralYear > selected.maxPeriod) return null;
    return { rate: selected.rate / 100, type: selected.type, maxPeriod: selected.maxPeriod };
  }

  // Fixed config - check maxPeriod
  if (deferralYear > config.maxPeriod) return null;

  // Tiered rates (Athene, EquiTrust)
  if (config.rates) {
    const tier = config.rates.find(r => deferralYear >= r.years[0] && deferralYear <= r.years[1]);
    if (!tier) return null;
    return { rate: tier.rate / 100, type: config.type ?? 'compound', maxPeriod: config.maxPeriod };
  }

  // Single rate (North American)
  if (config.rate !== undefined) {
    return { rate: config.rate / 100, type: config.type ?? 'compound', maxPeriod: config.maxPeriod };
  }

  return null;
}
