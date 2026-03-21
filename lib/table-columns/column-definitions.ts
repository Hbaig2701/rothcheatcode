/**
 * Column Definitions for Adjustable Projection Tables
 *
 * Centralized registry of all available columns with metadata for:
 * - Display labels and descriptions
 * - Formatting (currency, percent, number)
 * - Product type visibility (Growth FIA, GI, or both)
 * - Default visibility and widths
 * - Category grouping for modal UI
 */

export type ColumnCategory =
  | 'core'           // Year, Age (always frozen)
  | 'balances'       // Account balances (BOY, EOY)
  | 'growth'         // Growth/interest, bonuses
  | 'distributions'  // RMD, conversions
  | 'income'         // SS, pension, other income
  | 'taxes'          // Tax calculations, MAGI, AGI, brackets
  | 'irmaa'          // IRMAA tier and surcharge
  | 'product'        // FIA-specific (bonus, surrender)
  | 'gi-income';     // GI-specific (rider, payouts)

export interface ColumnDefinition {
  id: string;                              // Maps to YearlyResult field
  label: string;                           // Display name
  category: ColumnCategory;                // For grouping in modal
  description?: string;                    // Tooltip/help text
  formatter: (value: any) => string;       // Display formatter
  frozen?: boolean;                        // Cannot be deselected (Year, Age)
  defaultVisible: boolean;                 // Visible by default
  visibleForProducts: ('growth' | 'gi' | 'all')[];
  defaultWidth?: number;                   // Default column width (px)
  minWidth?: number;                       // Minimum column width (px)
}

/**
 * Format currency values (in cents) as dollars
 */
function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const dollars = value / 100;
  return dollars >= 0
    ? `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : `-$${Math.abs(dollars).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/**
 * Format percentage values
 */
function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(1)}%`;
}

/**
 * Format plain numbers
 */
function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return String(value);
}

/**
 * Format tier numbers (0-5)
 */
function formatTier(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value === 0) return 'Standard';
  if (value === 5) return 'Tier 5 (Highest)';
  return `Tier ${value}`;
}

/**
 * Complete column registry (~40 columns)
 */
export const COLUMN_DEFINITIONS: ColumnDefinition[] = [
  // ============================================================
  // CORE (Always Frozen)
  // ============================================================
  {
    id: 'year',
    label: 'Year',
    category: 'core',
    formatter: formatNumber,
    frozen: true,
    defaultVisible: true,
    visibleForProducts: ['all'],
    defaultWidth: 80,
    minWidth: 60,
  },
  {
    id: 'age',
    label: 'Age',
    category: 'core',
    formatter: formatNumber,
    frozen: true,
    defaultVisible: true,
    visibleForProducts: ['all'],
    defaultWidth: 70,
    minWidth: 60,
  },
  {
    id: 'spouseAge',
    label: 'Spouse Age',
    category: 'core',
    formatter: (v) => v ? formatNumber(v) : '—',
    frozen: true,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 110,
    minWidth: 90,
  },

  // ============================================================
  // BALANCES (Account Values)
  // ============================================================
  {
    id: 'traditionalBalance',
    label: 'Traditional IRA',
    category: 'balances',
    description: 'End of year Traditional IRA balance',
    formatter: formatCurrency,
    defaultVisible: true,
    visibleForProducts: ['growth'],
    defaultWidth: 150,
    minWidth: 120,
  },
  {
    id: 'traditionalBOY',
    label: 'Traditional BOY',
    category: 'balances',
    description: 'Beginning of year Traditional IRA balance',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['growth'],
    defaultWidth: 150,
    minWidth: 120,
  },
  {
    id: 'rothBalance',
    label: 'Roth IRA',
    category: 'balances',
    description: 'End of year Roth IRA balance',
    formatter: formatCurrency,
    defaultVisible: true,
    visibleForProducts: ['all'],
    defaultWidth: 130,
    minWidth: 110,
  },
  {
    id: 'rothBOY',
    label: 'Roth BOY',
    category: 'balances',
    description: 'Beginning of year Roth IRA balance',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 130,
    minWidth: 110,
  },
  {
    id: 'taxableBalance',
    label: 'Taxable Account',
    category: 'balances',
    description: 'Taxable account balance (tracks tax payments)',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 150,
    minWidth: 120,
  },
  {
    id: 'taxableBOY',
    label: 'Taxable BOY',
    category: 'balances',
    description: 'Beginning of year taxable account balance',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 150,
    minWidth: 120,
  },
  {
    id: 'netWorth',
    label: 'Net Worth',
    category: 'balances',
    description: 'Total net worth (all accounts)',
    formatter: formatCurrency,
    defaultVisible: true,
    visibleForProducts: ['all'],
    defaultWidth: 140,
    minWidth: 120,
  },

  // ============================================================
  // GROWTH & INTEREST
  // ============================================================
  {
    id: 'traditionalGrowth',
    label: 'Traditional Growth',
    category: 'growth',
    description: 'Annual growth/interest on Traditional IRA',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['growth'],
    defaultWidth: 160,
    minWidth: 120,
  },
  {
    id: 'rothGrowth',
    label: 'Roth Growth',
    category: 'growth',
    description: 'Annual growth/interest on Roth IRA',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 140,
    minWidth: 120,
  },
  {
    id: 'taxableGrowth',
    label: 'Taxable Growth',
    category: 'growth',
    description: 'Annual growth/interest on taxable account',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 150,
    minWidth: 120,
  },

  // ============================================================
  // DISTRIBUTIONS & CONVERSIONS
  // ============================================================
  {
    id: 'rmdAmount',
    label: 'RMD',
    category: 'distributions',
    description: 'Required Minimum Distribution',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 120,
    minWidth: 90,
  },
  {
    id: 'conversionAmount',
    label: 'Conversion',
    category: 'distributions',
    description: 'Roth conversion amount',
    formatter: formatCurrency,
    defaultVisible: true,
    visibleForProducts: ['all'],
    defaultWidth: 130,
    minWidth: 110,
  },

  // ============================================================
  // INCOME
  // ============================================================
  {
    id: 'ssIncome',
    label: 'Social Security',
    category: 'income',
    description: 'Social Security income (tax-exempt in simplified model)',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 150,
    minWidth: 120,
  },
  {
    id: 'pensionIncome',
    label: 'Pension',
    category: 'income',
    description: 'Pension income',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 120,
    minWidth: 100,
  },
  {
    id: 'otherIncome',
    label: 'Other Income',
    category: 'income',
    description: 'Other taxable income',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 140,
    minWidth: 110,
  },
  {
    id: 'totalIncome',
    label: 'Total Income',
    category: 'income',
    description: 'Total gross income',
    formatter: formatCurrency,
    defaultVisible: true,
    visibleForProducts: ['all'],
    defaultWidth: 140,
    minWidth: 110,
  },

  // ============================================================
  // TAXES
  // ============================================================
  {
    id: 'magi',
    label: 'MAGI',
    category: 'taxes',
    description: 'Modified Adjusted Gross Income (for IRMAA calculations)',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 130,
    minWidth: 100,
  },
  {
    id: 'agi',
    label: 'AGI',
    category: 'taxes',
    description: 'Adjusted Gross Income',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 120,
    minWidth: 100,
  },
  {
    id: 'standardDeduction',
    label: 'Std Deduction',
    category: 'taxes',
    description: 'Standard deduction (age-adjusted)',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 140,
    minWidth: 110,
  },
  {
    id: 'taxableIncome',
    label: 'Taxable Income',
    category: 'taxes',
    description: 'Taxable income after deductions',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 150,
    minWidth: 120,
  },
  {
    id: 'federalTaxBracket',
    label: 'Tax Bracket',
    category: 'taxes',
    description: 'Marginal federal tax bracket',
    formatter: formatPercent,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 120,
    minWidth: 100,
  },
  {
    id: 'federalTax',
    label: 'Federal Tax',
    category: 'taxes',
    description: 'Total federal income tax',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 130,
    minWidth: 110,
  },
  {
    id: 'federalTaxOnConversions',
    label: 'Fed Tax (Conversions)',
    category: 'taxes',
    description: 'Federal tax on Roth conversions',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 170,
    minWidth: 130,
  },
  {
    id: 'federalTaxOnOrdinaryIncome',
    label: 'Fed Tax (Ordinary)',
    category: 'taxes',
    description: 'Federal tax on ordinary income (RMDs, GI, etc.)',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 160,
    minWidth: 130,
  },
  {
    id: 'stateTax',
    label: 'State Tax',
    category: 'taxes',
    description: 'Total state income tax',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 120,
    minWidth: 100,
  },
  {
    id: 'totalTax',
    label: 'Total Tax',
    category: 'taxes',
    description: 'Total taxes (federal + state + IRMAA)',
    formatter: formatCurrency,
    defaultVisible: true,
    visibleForProducts: ['all'],
    defaultWidth: 130,
    minWidth: 110,
  },

  // ============================================================
  // IRMAA (Medicare Surcharges)
  // ============================================================
  {
    id: 'irmaaTier',
    label: 'IRMAA Tier',
    category: 'irmaa',
    description: 'IRMAA tier (0=Standard, 1-5=Surcharge tiers)',
    formatter: formatTier,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 130,
    minWidth: 110,
  },
  {
    id: 'irmaaSurcharge',
    label: 'IRMAA Amount',
    category: 'irmaa',
    description: 'Annual IRMAA surcharge (Medicare Part B/D)',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 140,
    minWidth: 110,
  },

  // ============================================================
  // PRODUCT-SPECIFIC (Growth FIA)
  // ============================================================
  {
    id: 'productBonusApplied',
    label: 'Product Bonus',
    category: 'product',
    description: 'Annual product bonus applied',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['growth'],
    defaultWidth: 140,
    minWidth: 110,
  },
  {
    id: 'surrenderChargePercent',
    label: 'Surrender Charge %',
    category: 'product',
    description: 'Surrender charge percentage',
    formatter: formatPercent,
    defaultVisible: false,
    visibleForProducts: ['growth'],
    defaultWidth: 160,
    minWidth: 130,
  },
  {
    id: 'surrenderValue',
    label: 'Surrender Value',
    category: 'product',
    description: 'Account value after surrender charge',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['growth'],
    defaultWidth: 150,
    minWidth: 120,
  },

  // ============================================================
  // GI-SPECIFIC (Guaranteed Income)
  // ============================================================
  {
    id: 'incomeRiderValue',
    label: 'Income Benefit Base',
    category: 'gi-income',
    description: 'Income benefit base (roll-up value)',
    formatter: formatCurrency,
    defaultVisible: true,
    visibleForProducts: ['gi'],
    defaultWidth: 180,
    minWidth: 140,
  },
  {
    id: 'accumulationValue',
    label: 'Accumulation Value',
    category: 'gi-income',
    description: 'Account accumulation value',
    formatter: formatCurrency,
    defaultVisible: true,
    visibleForProducts: ['gi'],
    defaultWidth: 170,
    minWidth: 130,
  },
  {
    id: 'incomePayoutAmount',
    label: 'GI Payment',
    category: 'gi-income',
    description: 'Guaranteed income payment received',
    formatter: formatCurrency,
    defaultVisible: true,
    visibleForProducts: ['gi'],
    defaultWidth: 140,
    minWidth: 110,
  },
  {
    id: 'riderFee',
    label: 'Rider Fee',
    category: 'gi-income',
    description: 'Annual rider fee charged',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['gi'],
    defaultWidth: 120,
    minWidth: 100,
  },
];

/**
 * Get column definitions filtered by product type
 */
export function getColumnsForProduct(productType: 'growth' | 'gi'): ColumnDefinition[] {
  return COLUMN_DEFINITIONS.filter(col =>
    col.visibleForProducts.includes(productType) || col.visibleForProducts.includes('all')
  );
}

/**
 * Get default visible columns for a product type
 */
export function getDefaultVisibleColumns(productType: 'growth' | 'gi'): string[] {
  return getColumnsForProduct(productType)
    .filter(col => col.defaultVisible)
    .map(col => col.id);
}

/**
 * Get column definition by ID
 */
export function getColumnById(id: string): ColumnDefinition | undefined {
  return COLUMN_DEFINITIONS.find(col => col.id === id);
}
