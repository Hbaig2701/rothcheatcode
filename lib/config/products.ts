// Product preset configuration for Product Preset dropdown
// This file ONLY defines UI presets - it does NOT modify any calculation formulas

export type GrowthFormulaType = 'fia' | 'short-term-cap-growth' | 'phased-bonus-growth' | 'vesting-bonus-growth';

export type GuaranteedIncomeFormulaType =
  | 'simple-rollup-income'
  | 'compound-rollup-income'
  | 'flat-rate-compound-income';

export type FormulaType = GrowthFormulaType | GuaranteedIncomeFormulaType;

export interface ProductDefaults {
  carrierName: string;
  productName: string;
  bonus: number;
  surrenderYears: number;
  surrenderSchedule?: number[]; // Surrender charge percentages by year (e.g., [16, 14.5, 13, ...])
  penaltyFreePercent: number;
  rateOfReturn: number;
  riderFee?: number; // Annual rider fee percentage (GI products only)
  anniversaryBonus?: number; // Anniversary bonus % applied at end of each bonus year
  anniversaryBonusYears?: number; // Number of years anniversary bonus is applied (e.g., 3)
}

export interface ProductConfig {
  id: FormulaType;
  label: string;
  category: 'Growth' | 'Guaranteed Income' | 'AUM';
  description: string;
  lockedFields: Array<'carrierName' | 'productName' | 'bonus' | 'surrenderYears' | 'penaltyFreePercent' | 'riderFee'>;
  defaults: ProductDefaults;
  comingSoon?: boolean;
}

// Fields that CAN be locked (product-specific)
export const LOCKABLE_FIELDS = [
  'carrierName',
  'productName',
  'bonus',
  'surrenderYears',
  'penaltyFreePercent',
  'riderFee',
] as const;

export const GROWTH_PRODUCTS: Record<GrowthFormulaType, ProductConfig> = {
  'fia': {
    id: 'fia',
    label: 'FIA',
    category: 'Growth',
    description: 'Generic Fixed Index Annuity - fully customizable',
    lockedFields: [], // No fields locked - user can edit everything
    defaults: {
      carrierName: 'Generic Carrier',
      productName: 'Generic Product',
      bonus: 10,
      surrenderYears: 7,
      penaltyFreePercent: 10,
      rateOfReturn: 7,
    },
  },

  'short-term-cap-growth': {
    id: 'short-term-cap-growth',
    label: 'Short-Term Cap Growth',
    category: 'Growth',
    description: '7-year growth product with no premium bonus and 10% penalty-free withdrawals',
    lockedFields: ['carrierName', 'productName', 'bonus', 'surrenderYears', 'penaltyFreePercent'],
    defaults: {
      carrierName: 'Insurance Carrier',
      productName: 'Short-Term Cap Growth',
      bonus: 0,
      surrenderYears: 7,
      penaltyFreePercent: 10,
      rateOfReturn: 7,
    },
  },

  'phased-bonus-growth': {
    id: 'phased-bonus-growth',
    label: 'Phased Bonus Growth',
    category: 'Growth',
    description: '8% premium bonus + 4% anniversary bonus (Years 1-3), 10-year surrender',
    lockedFields: ['carrierName', 'productName', 'bonus', 'surrenderYears', 'penaltyFreePercent'],
    defaults: {
      carrierName: 'Insurance Carrier',
      productName: 'Phased Bonus Growth',
      bonus: 8,
      surrenderYears: 10,
      surrenderSchedule: [16, 14.5, 13, 11.5, 9.5, 8, 6.5, 5, 3, 1],
      penaltyFreePercent: 10,
      rateOfReturn: 7,
      anniversaryBonus: 4,
      anniversaryBonusYears: 3,
    },
  },

  'vesting-bonus-growth': {
    id: 'vesting-bonus-growth',
    label: 'Vesting Bonus Growth',
    category: 'Growth',
    description: '14% vesting bonus, 100% participation rate, 10-year surrender',
    lockedFields: ['carrierName', 'productName', 'bonus', 'surrenderYears', 'penaltyFreePercent'],
    defaults: {
      carrierName: 'Insurance Carrier',
      productName: 'Vesting Bonus Growth',
      bonus: 14,
      surrenderYears: 10,
      penaltyFreePercent: 10,
      rateOfReturn: 0,
    },
  },
};

export const GUARANTEED_INCOME_PRODUCTS: Record<GuaranteedIncomeFormulaType, ProductConfig> = {
  'simple-rollup-income': {
    id: 'simple-rollup-income',
    label: 'Simple Roll-up Income',
    category: 'Guaranteed Income',
    description: 'Simple interest roll-up with 14% bonus to both account value and income base',
    lockedFields: ['carrierName', 'productName', 'bonus', 'surrenderYears', 'penaltyFreePercent', 'riderFee'],
    defaults: {
      carrierName: 'Insurance Carrier',
      productName: 'Simple Roll-up Income',
      bonus: 14,
      surrenderYears: 10,
      penaltyFreePercent: 10,
      rateOfReturn: 0,
      riderFee: 1.20,
    },
  },

  'compound-rollup-income': {
    id: 'compound-rollup-income',
    label: 'Compound Roll-up Income',
    category: 'Guaranteed Income',
    description: 'Compound interest roll-up with 20% income base bonus, tiered growth rates',
    lockedFields: ['carrierName', 'productName', 'bonus', 'surrenderYears', 'penaltyFreePercent', 'riderFee'],
    defaults: {
      carrierName: 'Insurance Carrier',
      productName: 'Compound Roll-up Income',
      bonus: 20,
      surrenderYears: 10,
      surrenderSchedule: [9, 8, 7, 6.5, 5.5, 4.5, 3.5, 2.5, 1.5, 0.5],
      penaltyFreePercent: 10,
      rateOfReturn: 0,
      riderFee: 1.25,
    },
  },

  'flat-rate-compound-income': {
    id: 'flat-rate-compound-income',
    label: 'Flat-Rate Compound Income',
    category: 'Guaranteed Income',
    description: 'No bonus, 8% compound roll-up, dual payout option (level/increasing)',
    lockedFields: ['carrierName', 'productName', 'bonus', 'surrenderYears', 'penaltyFreePercent', 'riderFee'],
    defaults: {
      carrierName: 'Insurance Carrier',
      productName: 'Flat-Rate Compound Income',
      bonus: 0,
      surrenderYears: 10,
      penaltyFreePercent: 10,
      rateOfReturn: 0,
      riderFee: 1.15,
    },
  },
};

// Combined lookup for all products
export const ALL_PRODUCTS: Record<FormulaType, ProductConfig> = {
  ...GROWTH_PRODUCTS,
  ...GUARANTEED_INCOME_PRODUCTS,
};

// Check if a formula type is a guaranteed income product
export function isGuaranteedIncomeProduct(formulaType: FormulaType): boolean {
  return formulaType in GUARANTEED_INCOME_PRODUCTS;
}

// Check if a formula type is a growth FIA product
export function isGrowthProduct(formulaType: FormulaType): boolean {
  return formulaType in GROWTH_PRODUCTS;
}

// Utility function to check if a field should be locked
export function isFieldLocked(
  fieldName: typeof LOCKABLE_FIELDS[number],
  formulaType: FormulaType
): boolean {
  const product = ALL_PRODUCTS[formulaType];
  if (!product) return false;
  return product.lockedFields.includes(fieldName);
}

// Get all available formula types for the dropdown
export function getAvailableFormulaTypes(): ProductConfig[] {
  return Object.values(ALL_PRODUCTS);
}
