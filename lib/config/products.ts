// Product preset configuration for Formula Type dropdown
// This file ONLY defines UI presets - it does NOT modify any calculation formulas

export type GrowthFormulaType = 'fia' | 'lincoln-optiblend-7' | 'equitrust-marketedge-bonus';

export type GuaranteedIncomeFormulaType =
  | 'athene-ascent-pro-10'
  | 'american-equity-incomeshield-bonus-10'
  | 'equitrust-marketearly-income-index'
  | 'north-american-income-pay-pro';

export type FormulaType = GrowthFormulaType | GuaranteedIncomeFormulaType;

export interface ProductDefaults {
  carrierName: string;
  productName: string;
  bonus: number;
  surrenderYears: number;
  penaltyFreePercent: number;
  rateOfReturn: number;
  riderFee?: number; // Annual rider fee percentage (GI products only)
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

  'lincoln-optiblend-7': {
    id: 'lincoln-optiblend-7',
    label: 'Lincoln Optiblend 7',
    category: 'Growth',
    description: 'Lincoln Financial OptiBlend 7-year product',
    lockedFields: ['carrierName', 'productName', 'bonus', 'surrenderYears', 'penaltyFreePercent'],
    defaults: {
      carrierName: 'Lincoln',
      productName: 'OptiBlend',
      bonus: 0,
      surrenderYears: 7,
      penaltyFreePercent: 10,
      rateOfReturn: 7,
    },
  },

  'equitrust-marketedge-bonus': {
    id: 'equitrust-marketedge-bonus',
    label: 'EquiTrust MarketEdge Bonus',
    category: 'Growth',
    description: 'EquiTrust MarketEdge with 11% bonus, 10-year surrender',
    lockedFields: ['carrierName', 'productName', 'bonus', 'surrenderYears', 'penaltyFreePercent'],
    defaults: {
      carrierName: 'EquiTrust',
      productName: 'MarketEdge Bonus',
      bonus: 11,
      surrenderYears: 10,
      penaltyFreePercent: 10,
      rateOfReturn: 7,
    },
  },
};

export const GUARANTEED_INCOME_PRODUCTS: Record<GuaranteedIncomeFormulaType, ProductConfig> = {
  'athene-ascent-pro-10': {
    id: 'athene-ascent-pro-10',
    label: 'Athene Ascent Pro 10',
    category: 'Guaranteed Income',
    description: 'Athene Ascent Pro 10 - Guaranteed Income product',
    lockedFields: ['carrierName', 'productName', 'bonus', 'surrenderYears', 'penaltyFreePercent', 'riderFee'],
    defaults: {
      carrierName: 'Athene',
      productName: 'Ascent Pro 10',
      bonus: 20,
      surrenderYears: 10,
      penaltyFreePercent: 10,
      rateOfReturn: 0,
      riderFee: 1.00,
    },
  },

  'american-equity-incomeshield-bonus-10': {
    id: 'american-equity-incomeshield-bonus-10',
    label: 'American Equity IncomeShield Bonus 10',
    category: 'Guaranteed Income',
    description: 'American Equity IncomeShield Bonus 10 - Guaranteed Income product',
    lockedFields: ['carrierName', 'productName', 'bonus', 'surrenderYears', 'penaltyFreePercent', 'riderFee'],
    defaults: {
      carrierName: 'American Equity',
      productName: 'IncomeShield Bonus 10',
      bonus: 14,
      surrenderYears: 10,
      penaltyFreePercent: 10,
      rateOfReturn: 0,
      riderFee: 1.20,
    },
  },

  'equitrust-marketearly-income-index': {
    id: 'equitrust-marketearly-income-index',
    label: 'EquiTrust MarketEarly Income Index',
    category: 'Guaranteed Income',
    description: 'EquiTrust MarketEarly Income Index - Guaranteed Income product',
    lockedFields: ['carrierName', 'productName', 'bonus', 'surrenderYears', 'penaltyFreePercent', 'riderFee'],
    defaults: {
      carrierName: 'EquiTrust',
      productName: 'MarketEarly Income Index',
      bonus: 20,
      surrenderYears: 10,
      penaltyFreePercent: 10,
      rateOfReturn: 0,
      riderFee: 1.25,
    },
  },

  'north-american-income-pay-pro': {
    id: 'north-american-income-pay-pro',
    label: 'North American Income Pay Pro',
    category: 'Guaranteed Income',
    description: 'North American Income Pay Pro - Guaranteed Income product',
    lockedFields: ['carrierName', 'productName', 'bonus', 'surrenderYears', 'penaltyFreePercent', 'riderFee'],
    defaults: {
      carrierName: 'North American',
      productName: 'Income Pay Pro',
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
