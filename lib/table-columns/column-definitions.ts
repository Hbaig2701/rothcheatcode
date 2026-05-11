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
  // Override default alignment. Core columns are left-aligned, others right-aligned (numeric).
  // Use 'left' for text columns in non-core categories like Phase.
  align?: 'left' | 'right';
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
 * Format GI phase values
 */
function formatGIPhase(value: string | null | undefined): string {
  if (!value) return '—';
  const map: Record<string, string> = {
    waiting: 'Wait',
    conversion: 'Convert',
    purchase: 'Purchase',
    deferral: 'Grow',
    income: 'Income',
  };
  return map[value] ?? value;
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
  {
    id: 'filingStatus',
    label: 'Filing Status',
    category: 'core',
    description: 'Filing status for the projection year. Mostly informational, but when widow analysis is enabled this column visibly switches from MFJ to Single starting at the configured first-death age — useful for explaining why baseline RMDs jump in tax that year. The actual value is injected at render time by year-by-year-table.tsx; the engine doesn\'t track filing status per year.',
    formatter: (v) => (typeof v === 'string' ? v : '—'),
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 130,
    minWidth: 100,
  },

  // ============================================================
  // BALANCES (Account Values)
  // ============================================================
  {
    id: 'traditionalBalance',
    label: 'Traditional IRA',
    category: 'balances',
    description: 'End-of-year Traditional IRA balance after distributions, conversions, and growth. In the baseline, this shrinks as RMDs are taken. In the strategy, it decreases faster due to Roth conversions.',
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
    description: 'Beginning-of-year Traditional IRA balance before any distributions, conversions, or growth are applied for that year.',
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
    description: 'End-of-year Roth IRA balance. Grows tax-free and is not subject to RMDs. In the strategy, this increases as conversions move money from Traditional to Roth.',
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
    description: 'Beginning-of-year Roth IRA balance before any new conversions or growth are applied for that year.',
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
    description: 'Taxable account balance. In the baseline, this accumulates after-tax RMD proceeds. In the strategy, this tracks the cumulative cost of taxes paid on conversions.',
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
    description: 'Beginning-of-year taxable account balance before any new deposits, withdrawals, or growth are applied.',
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
    description: 'Total net worth across all accounts (Traditional + Roth + Taxable). This is the combined value your client controls at end of year.',
    formatter: formatCurrency,
    defaultVisible: true,
    visibleForProducts: ['all'],
    defaultWidth: 140,
    minWidth: 120,
  },
  {
    id: 'aumBalance',
    label: 'AUM Bucket',
    category: 'balances',
    description: 'End-of-year balance of the managed brokerage (AUM) portion of the strategy. This is the SUBSET of "Taxable Account" that lives in the AUM bucket — the rest of taxableBalance is the client\'s original taxable account plus any conversion-tax flows. Empty/$0 when AUM split allocation is not enabled.',
    formatter: (v) => v != null ? formatCurrency(v) : '—',
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 150,
    minWidth: 120,
  },

  // ============================================================
  // GROWTH & INTEREST
  // ============================================================
  {
    id: 'traditionalGrowth',
    label: 'Traditional Growth',
    category: 'growth',
    description: 'Annual growth earned on the Traditional IRA. Calculated as (Balance after distributions) x Rate of Return. Growth is tax-deferred until withdrawn.',
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
    description: 'Annual growth earned on the Roth IRA. Calculated as (Balance after conversions) x Rate of Return. This growth is completely tax-free.',
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
    description: 'Annual growth earned on the taxable account. Only applies in the baseline when RMDs are reinvested. In the strategy, this is typically $0 since the taxable account only tracks tax payments.',
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
    description: 'Required Minimum Distribution. The IRS-mandated annual withdrawal from a Traditional IRA starting at age 73. Calculated using IRS Uniform Lifetime Table divisors applied to the prior year-end balance.',
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
    description: 'Amount converted from Traditional IRA to Roth IRA this year. The conversion is sized to fill up to the target federal tax bracket ceiling, minimizing the tax cost of each conversion.',
    formatter: formatCurrency,
    defaultVisible: true,
    visibleForProducts: ['all'],
    defaultWidth: 130,
    minWidth: 110,
  },
  {
    id: 'totalIRAWithdrawal',
    label: 'Total IRA Withdrawal',
    category: 'distributions',
    description: 'Total amount withdrawn from the Traditional IRA this year: conversions + taxes paid from IRA + RMDs + voluntary withdrawals. This is the number to give the annuity carrier.',
    formatter: formatCurrency,
    defaultVisible: true,
    visibleForProducts: ['growth'],
    defaultWidth: 160,
    minWidth: 130,
  },
  {
    id: 'iraWithdrawal',
    label: 'IRA Withdrawal',
    category: 'distributions',
    description: 'Total IRA pulls outside of RMDs and conversions for the year. Combines: (a) advisor-scheduled voluntary withdrawals from the Roth conversion bucket, AND (b) the AUM-engine\'s IRA-to-AUM transfer when AUM split is on. Use the separate "AUM Transfer" column if you need to see just the AUM-side pull. Adds to taxable income; 10% penalty if under 59½ rolls into "Early W/D Penalty".',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 160,
    minWidth: 130,
  },
  {
    id: 'rothWithdrawal',
    label: 'Roth Withdrawal',
    category: 'distributions',
    description: 'Voluntary Roth withdrawal scheduled by the advisor (tax-free, assumes qualified — 5-year rule + age 59½).',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 160,
    minWidth: 130,
  },
  {
    id: 'aumTransfer',
    label: 'AUM Transfer',
    category: 'distributions',
    description: 'IRA-to-AUM pull made by the AUM engine this year. SUBSET of "IRA Withdrawal" — the rest of that column is advisor-scheduled voluntary IRA pulls. Empty when AUM split allocation is not enabled. Each year\'s amount is pendingIRA / yearsRemaining, so the transfer spreads the tax burden evenly even though pendingIRA grows tax-deferred while waiting.',
    formatter: (v) => v != null ? formatCurrency(v) : '—',
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 160,
    minWidth: 130,
  },
  {
    id: 'aumScheduledWithdrawal',
    label: 'AUM Spending W/D',
    category: 'distributions',
    description: 'Advisor-scheduled spending withdrawal absorbed by the AUM brokerage. Fires when client.withdrawals tags an "ira"/"auto" pull but the Roth-side IRA balance is too small to satisfy it (typical at high aum_allocation_percent). Tax treatment is brokerage liquidation: pro-rata between basis (tax-free) and gain (LTCG); the LTCG cost is rolled into "Total Tax". Reduces the AUM bucket balance. NOT subject to the 10% early-withdrawal penalty even under 59½ — the qualified tax was already paid on the IRA→AUM transfer, so the IRS treats this as a sale, not an early IRA distribution.',
    formatter: (v) => v != null && v > 0 ? formatCurrency(v) : '—',
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 170,
    minWidth: 140,
  },
  {
    id: 'taxesPaidFromIRA',
    label: 'Taxes Paid from IRA',
    category: 'distributions',
    description: 'The specific amount withdrawn from the IRA to pay federal and state taxes on the Roth conversion. This is the portion of the Total IRA Withdrawal that goes directly to the IRS. When the carrier penalty-free cap is active and binding, this is capped at penalty_free_percent × beginning-of-year IRA — any overflow appears in "Conversion Tax (External)" instead.',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 170,
    minWidth: 130,
  },
  {
    id: 'taxesPaidExternally',
    label: 'Conversion Tax (External)',
    category: 'distributions',
    description: 'Conversion tax assumed to be paid from external (non-IRA) funds because the carrier penalty-free cap binds. Fires only when respect_penalty_free_limit is on, tax_payment_source is "from IRA", and the year\'s conversion tax exceeds the per-year cap. The conversion itself is unaffected — it\'s an intra-carrier Trad → Roth transfer that doesn\'t count against the carrier\'s withdrawal allowance — only the dollars that physically have to leave the policy to pay tax are restricted.',
    formatter: (v) => v != null && v > 0 ? formatCurrency(v) : '—',
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 190,
    minWidth: 150,
  },

  // ============================================================
  // INCOME
  // ============================================================
  {
    id: 'ssIncome',
    label: 'Social Security',
    category: 'income',
    description: 'Annual Social Security income including cost-of-living adjustments. Included in MAGI for Medicare surcharge (IRMAA) calculations.',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 150,
    minWidth: 120,
  },
  {
    id: 'otherIncome',
    label: 'Other Income (All)',
    category: 'income',
    description: 'Total of all non-SSI income for this year (pension, rental, dividends, capital gains, wages, etc. combined). This is the aggregate used in tax calculations.',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 150,
    minWidth: 120,
  },
  {
    id: 'incomePension',
    label: 'Pension',
    category: 'income',
    description: 'Pension income for this year (from entries labeled as Pension in the Non-SSI income table).',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 130,
    minWidth: 100,
  },
  {
    id: 'incomeRental',
    label: 'Rental Income',
    category: 'income',
    description: 'Rental income for this year (from entries labeled as Rental Income in the Non-SSI income table).',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 140,
    minWidth: 110,
  },
  {
    id: 'incomeDividends',
    label: 'Dividends & Interest',
    category: 'income',
    description: 'Dividends and interest income for this year.',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 170,
    minWidth: 130,
  },
  {
    id: 'incomeCapitalGains',
    label: 'Capital Gains',
    category: 'income',
    description: 'Capital gains income for this year.',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 140,
    minWidth: 110,
  },
  {
    id: 'incomeWages',
    label: 'Wages / Part-Time',
    category: 'income',
    description: 'Part-time work or wage income for this year.',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 150,
    minWidth: 120,
  },
  {
    id: 'incomeAnnuity',
    label: 'Annuity Income',
    category: 'income',
    description: 'Non-qualified annuity income for this year.',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 140,
    minWidth: 110,
  },
  {
    id: 'incomeOther',
    label: 'Other (Uncategorized)',
    category: 'income',
    description: 'Income entries explicitly labeled as "Other" in the Non-SSI income table.',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 170,
    minWidth: 130,
  },
  {
    id: 'totalIncome',
    label: 'Total Income',
    category: 'income',
    description: 'Total gross income for the year, including RMDs/conversions, Social Security, pension, and other income. This is the starting point for tax calculations.',
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
    description: 'Modified Adjusted Gross Income. Your total income including tax-exempt interest and Social Security. Medicare uses this number (from 2 years ago) to determine if you owe extra premiums (IRMAA) — a key reason to manage conversion sizes carefully.',
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
    description: 'Adjusted Gross Income. Total taxable income before the standard deduction is applied — includes conversions, RMDs, and other taxable income.',
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
    description: 'Standard deduction applied to gross income. Increases at age 65+ for each spouse. Filing status (single vs MFJ) also affects the amount. This reduces taxable income before tax brackets apply.',
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
    description: 'Taxable income after subtracting the standard deduction from gross income. This is the amount that actually gets taxed at federal bracket rates.',
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
    description: 'The highest federal tax bracket reached this year. Conversions are sized to stay within the target bracket — going above it means paying a higher marginal rate on each additional dollar converted.',
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
    description: 'Total federal income tax owed this year across all income sources (conversions, RMDs, ordinary income). Calculated using progressive bracket rates.',
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
    description: 'Federal tax attributable to Roth conversions only. Calculated at the marginal rate — this is the "cost" of converting, which is recovered over time through tax-free Roth growth.',
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
    description: 'Federal tax on ordinary income sources like RMDs, guaranteed income payouts, and other non-conversion income. In the baseline, this is the primary tax cost each year.',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 160,
    minWidth: 130,
  },
  {
    id: 'earlyWithdrawalPenalty',
    label: 'Early W/D Penalty',
    category: 'taxes',
    description: '10% early withdrawal penalty on IRA distributions used to pay conversion taxes when the client is under 59½. Only applies when taxes are paid from the IRA (internal payment source). The conversion itself is penalty-exempt — only the extra withdrawal to cover taxes triggers the penalty.',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 160,
    minWidth: 120,
  },
  {
    id: 'stateTax',
    label: 'State Tax',
    category: 'taxes',
    description: 'Total state income tax. Uses the client\'s state rate (or override if set). Applied to conversions and ordinary income. Some states have no income tax.',
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
    description: 'Total tax burden for the year — federal income tax + state income tax + IRMAA Medicare surcharges + 10% early-withdrawal penalty. When AUM split is on, this also includes the AUM bucket\'s ordinary tax + dividend drag + cap-gains turnover. This is the total cost of taxable events this year.',
    formatter: formatCurrency,
    defaultVisible: true,
    visibleForProducts: ['all'],
    defaultWidth: 130,
    minWidth: 110,
  },
  {
    id: 'aumTax',
    label: 'AUM Tax',
    category: 'taxes',
    description: 'AUM bucket\'s tax for the year: ordinary income tax on the IRA-to-AUM transfer + annual dividend tax (LTCG rate) + realized cap-gains turnover tax + 10% early-withdrawal penalty if applicable. This number is ALREADY counted in "Federal Tax" + "State Tax" + "Early W/D Penalty" on the same row — the column just isolates the AUM-side portion. Empty when AUM split allocation is not enabled.',
    formatter: (v) => v != null ? formatCurrency(v) : '—',
    defaultVisible: false,
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
    description: 'IRMAA tier based on income from 2 years prior. Standard means no extra Medicare cost. Tiers 1-5 add increasing monthly surcharges to Medicare premiums. Large conversions can push clients into higher tiers.',
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
    description: 'Extra annual Medicare premium due to income level. Based on income from 2 years ago. Applies at age 65+. Can range from $0 to over $10,000/year depending on income.',
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
    description: 'Product bonus credited by the insurance carrier. For Growth FIA: shows the upfront premium bonus in year 1 (e.g., 14% × initial deposit) and any anniversary bonuses in years 1–3 if the contract has them. For Guaranteed Income, applied once at purchase to the income base and/or account value.',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['all'],
    defaultWidth: 140,
    minWidth: 110,
  },
  {
    id: 'surrenderChargePercent',
    label: 'Surrender Charge %',
    category: 'product',
    description: 'Current surrender charge percentage if the annuity were liquidated this year. Typically starts at 8-10% and decreases to 0% over the surrender period (usually 7-10 years).',
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
    description: 'The amount you would actually receive if the annuity were surrendered this year. Equals account value minus surrender charge. Reaches full value once the surrender period ends.',
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
    description: 'The income benefit base used to calculate guaranteed income payouts. Grows during the deferral period via the roll-up rate (not actual account value). Higher benefit base = higher guaranteed income.',
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
    description: 'The actual cash value of the annuity contract. Grows during deferral but decreases during the income phase as payouts are made. Separate from the income benefit base.',
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
    description: 'Annual guaranteed income payment from the annuity. Calculated as Income Benefit Base x Payout Rate. These payments continue for life even after the accumulation value reaches $0.',
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
    description: 'Annual fee for the guaranteed income rider, charged as a percentage of the accumulation value. This fee is the cost of the income guarantee and reduces the accumulation value each year.',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['gi'],
    defaultWidth: 120,
    minWidth: 100,
  },
  {
    id: 'giPhase',
    label: 'Phase',
    category: 'gi-income',
    description: 'Current phase of the GI plan: Convert (strategy only — Roth conversions), Wait (baseline only — pre-purchase), Purchase (buy GI rider), Grow (income base rolls up during deferral), or Income (guaranteed payments begin).',
    formatter: formatGIPhase,
    defaultVisible: true,
    visibleForProducts: ['gi'],
    defaultWidth: 110,
    minWidth: 90,
    align: 'left',
  },
  {
    id: 'giIncomeNet',
    label: 'GI Income (Net)',
    category: 'gi-income',
    description: 'After-tax guaranteed income received this year. For the strategy (Roth GI), this equals the gross payment — all income is tax-free. For the baseline (Traditional GI), this is gross minus federal + state tax.',
    formatter: formatCurrency,
    defaultVisible: true,
    visibleForProducts: ['gi'],
    defaultWidth: 150,
    minWidth: 120,
  },
  {
    id: 'giCumulativeIncome',
    label: 'Cumulative GI Income',
    category: 'gi-income',
    description: 'Lifetime running total of net GI income received. Useful for showing clients how much they have received by any given age, even after their account value depletes.',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['gi'],
    defaultWidth: 180,
    minWidth: 140,
  },
  {
    id: 'giRollUpGrowth',
    label: 'Roll-Up Growth',
    category: 'gi-income',
    description: 'Growth added to the income base this year via the roll-up rate (e.g., +8% simple or compound). Only accrues during the deferral phase and on the purchase year. This is a guaranteed growth rate on the income base — not on the actual account value.',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['gi'],
    defaultWidth: 150,
    minWidth: 120,
  },
  {
    id: 'giPayoutRate',
    label: 'Payout Rate',
    category: 'gi-income',
    description: 'Payout percentage applied to the income base to calculate the annual GI payment (e.g., 6.60%). Locked in at the start of the income phase and depends on the client\'s age and payout type.',
    formatter: formatPercent,
    defaultVisible: false,
    visibleForProducts: ['gi'],
    defaultWidth: 130,
    minWidth: 100,
  },
  {
    id: 'giConversionTax',
    label: 'Conversion Tax',
    category: 'gi-income',
    description: 'Tax paid during the Roth conversion phase (federal + state combined). This is the one-time cost of the strategy — paid upfront in exchange for tax-free GI income for life. Zero during all non-conversion phases and in the baseline.',
    formatter: formatCurrency,
    defaultVisible: false,
    visibleForProducts: ['gi'],
    defaultWidth: 150,
    minWidth: 120,
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
