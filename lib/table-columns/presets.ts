/**
 * Column Presets for Different Product Types and Views
 *
 * Pre-configured column selections for common use cases
 */

export interface ColumnPreset {
  name: string;
  productType: 'growth' | 'gi' | 'all';
  columns: string[];  // Column IDs in display order
}

/**
 * Default column presets
 */
export const DEFAULT_PRESETS: Record<string, ColumnPreset> = {
  growth: {
    name: 'Growth FIA Default',
    productType: 'growth',
    columns: [
      'year',
      'age',
      'traditionalBalance',
      'rothBalance',
      'conversionAmount',
      'totalIRAWithdrawal',
      'totalIncome',
      'totalTax',
      'netWorth',
    ],
  },

  gi: {
    name: 'Guaranteed Income Default',
    productType: 'gi',
    columns: [
      'year',
      'age',
      'giPhase',
      'incomeRiderValue',
      'accumulationValue',
      'incomePayoutAmount',
      'giIncomeNet',
      'totalTax',
      'netWorth',
    ],
  },

  taxAnalysis: {
    name: 'Tax Analysis',
    productType: 'all',
    columns: [
      'year',
      'age',
      'magi',
      'agi',
      'taxableIncome',
      'federalTaxBracket',
      'irmaaTier',
      'federalTax',
      'stateTax',
      'totalTax',
    ],
  },

  irmaaFocus: {
    name: 'IRMAA Focus',
    productType: 'all',
    columns: [
      'year',
      'age',
      'magi',
      'irmaaTier',
      'irmaaSurcharge',
      'conversionAmount',
      'totalIncome',
      'totalTax',
    ],
  },

  accountDetail: {
    name: 'Account Detail',
    productType: 'all',
    columns: [
      'year',
      'age',
      'traditionalBOY',
      'traditionalGrowth',
      'traditionalBalance',
      'rothBOY',
      'rothGrowth',
      'rothBalance',
      'netWorth',
    ],
  },
};
