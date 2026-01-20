import { TaxBracket } from '@/lib/calculations/types';

/**
 * 2026 Federal Tax Brackets (Estimated with ~3% inflation from 2024 base)
 * All threshold values in cents
 * Rates as percentages (e.g., 22 = 22%)
 *
 * Source: Roth Blueprint Specification v1.0
 */
export const FEDERAL_BRACKETS_2026: Record<string, TaxBracket[]> = {
  single: [
    { lower: 0, upper: 1192500, rate: 10 },             // $0 - $11,925
    { lower: 1192500, upper: 4847500, rate: 12 },       // $11,925 - $48,475
    { lower: 4847500, upper: 10335000, rate: 22 },      // $48,475 - $103,350
    { lower: 10335000, upper: 20177500, rate: 24 },     // $103,350 - $201,775
    { lower: 20177500, upper: 25617500, rate: 32 },     // $201,775 - $256,175
    { lower: 25617500, upper: 64147500, rate: 35 },     // $256,175 - $641,475
    { lower: 64147500, upper: Infinity, rate: 37 }      // $641,475+
  ],
  married_filing_jointly: [
    { lower: 0, upper: 2385000, rate: 10 },             // $0 - $23,850
    { lower: 2385000, upper: 9695000, rate: 12 },       // $23,850 - $96,950
    { lower: 9695000, upper: 20670000, rate: 22 },      // $96,950 - $206,700
    { lower: 20670000, upper: 40355000, rate: 24 },     // $206,700 - $403,550
    { lower: 40355000, upper: 51235000, rate: 32 },     // $403,550 - $512,350
    { lower: 51235000, upper: 76845000, rate: 35 },     // $512,350 - $768,450
    { lower: 76845000, upper: Infinity, rate: 37 }      // $768,450+
  ],
  married_filing_separately: [
    { lower: 0, upper: 1192500, rate: 10 },             // $0 - $11,925
    { lower: 1192500, upper: 4847500, rate: 12 },       // $11,925 - $48,475
    { lower: 4847500, upper: 10335000, rate: 22 },      // $48,475 - $103,350
    { lower: 10335000, upper: 20177500, rate: 24 },     // $103,350 - $201,775
    { lower: 20177500, upper: 25617500, rate: 32 },     // $201,775 - $256,175
    { lower: 25617500, upper: 38422500, rate: 35 },     // $256,175 - $384,225
    { lower: 38422500, upper: Infinity, rate: 37 }      // $384,225+
  ],
  head_of_household: [
    { lower: 0, upper: 1700000, rate: 10 },             // $0 - $17,000
    { lower: 1700000, upper: 6475000, rate: 12 },       // $17,000 - $64,750
    { lower: 6475000, upper: 10335000, rate: 22 },      // $64,750 - $103,350
    { lower: 10335000, upper: 20177500, rate: 24 },     // $103,350 - $201,775
    { lower: 20177500, upper: 25617500, rate: 32 },     // $201,775 - $256,175
    { lower: 25617500, upper: 64147500, rate: 35 },     // $256,175 - $641,475
    { lower: 64147500, upper: Infinity, rate: 37 }      // $641,475+
  ]
};

/**
 * Tax on lower brackets (cumulative tax at bracket floor)
 * Used for quick calculation: total_tax = tax_on_lower + (income_in_bracket * rate)
 * All values in cents
 */
export const TAX_ON_LOWER_BRACKETS_2026: Record<string, number[]> = {
  single: [
    0,           // 10% bracket floor
    119250,      // $1,192.50 - tax at $11,925
    557850,      // $5,578.50 - tax at $48,475
    1765150,     // $17,651.50 - tax at $103,350
    4127350,     // $41,273.50 - tax at $201,775
    5868150,     // $58,681.50 - tax at $256,175
    19351650     // $193,516.50 - tax at $641,475
  ],
  married_filing_jointly: [
    0,           // 10% bracket floor
    238500,      // $2,385.00 - tax at $23,850
    1115700,     // $11,157.00 - tax at $96,950
    3530200,     // $35,302.00 - tax at $206,700
    8254600,     // $82,546.00 - tax at $403,550
    11736200,    // $117,362.00 - tax at $512,350
    20699700     // $206,997.00 - tax at $768,450
  ]
};

// 3% annual inflation rate per specification
const INFLATION_RATE = 0.03;

/**
 * Get federal tax brackets for a given year and filing status
 * Applies inflation adjustment for years beyond 2026
 */
export function getFederalBrackets(year: number, status: string): TaxBracket[] {
  const baseBrackets = FEDERAL_BRACKETS_2026[status] ?? FEDERAL_BRACKETS_2026.single;

  if (year <= 2026) {
    return baseBrackets;
  }

  const yearsFromBase = year - 2026;
  const inflationFactor = Math.pow(1 + INFLATION_RATE, yearsFromBase);

  return baseBrackets.map(bracket => ({
    lower: Math.round(bracket.lower * inflationFactor / 100) * 100, // Round to nearest $1
    upper: bracket.upper === Infinity
      ? Infinity
      : Math.round(bracket.upper * inflationFactor / 100) * 100,
    rate: bracket.rate // Rate stays the same
  }));
}

/**
 * Get the bracket ceiling for a target tax rate
 * Returns the maximum taxable income that stays within the target bracket
 */
export function getBracketCeiling(filingStatus: string, maxRate: number, year: number = 2026): number {
  const brackets = getFederalBrackets(year, filingStatus);
  const targetBracket = brackets.find(b => b.rate === maxRate);
  return targetBracket ? targetBracket.upper : 0;
}
