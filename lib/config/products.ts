// Product preset configuration for Blueprint Type dropdown
// This file ONLY defines UI presets - it does NOT modify any calculation formulas

export type BlueprintType = 'fia' | 'lincoln-optiblend-7' | 'equitrust-marketedge-bonus';

export interface ProductDefaults {
  carrierName: string;
  productName: string;
  bonus: number;
  surrenderYears: number;
  penaltyFreePercent: number;
  rateOfReturn: number;
}

export interface ProductConfig {
  id: BlueprintType;
  label: string;
  category: 'Growth' | 'Guaranteed Income' | 'AUM';
  description: string;
  lockedFields: Array<'carrierName' | 'productName' | 'bonus' | 'surrenderYears' | 'penaltyFreePercent'>;
  defaults: ProductDefaults;
}

// Fields that CAN be locked (product-specific)
export const LOCKABLE_FIELDS = [
  'carrierName',
  'productName',
  'bonus',
  'surrenderYears',
  'penaltyFreePercent',
] as const;

export const GROWTH_PRODUCTS: Record<BlueprintType, ProductConfig> = {
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

// Utility function to check if a field should be locked
export function isFieldLocked(
  fieldName: typeof LOCKABLE_FIELDS[number],
  blueprintType: BlueprintType
): boolean {
  const product = GROWTH_PRODUCTS[blueprintType];
  if (!product) return false;
  return product.lockedFields.includes(fieldName);
}

// Get all available blueprint types for the dropdown
export function getAvailableBlueprintTypes(): ProductConfig[] {
  return Object.values(GROWTH_PRODUCTS);
}
