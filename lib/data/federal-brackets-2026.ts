import { TaxBracket } from '@/lib/calculations/types';

/**
 * 2026 Federal Tax Brackets — ACTUAL published figures.
 * All threshold values in cents; rates as percentages (22 = 22%).
 *
 * Source: IRS Rev. Proc. 2025-32 (tax year 2026).
 * Cross-checked against Tax Foundation's 2026 bracket tables.
 *
 * Married filing separately is defined as half the joint thresholds (37%
 * starts at $384,350); it therefore matches single except in the 35% band.
 *
 * HISTORY: this file previously held ESTIMATED brackets ("~3% inflation from a
 * 2024 base") that were never replaced once the IRS published the real 2026
 * numbers. The MFJ 12% ceiling read $96,950 instead of $100,800, so every
 * bracket-filling conversion was sized ~4% short. Corrected 2026-09-25.
 * When the 2027 figures publish, replace these and delete the inflation
 * fallback below for that year.
 */
export const FEDERAL_BRACKETS_2026: Record<string, TaxBracket[]> = {
  single: [
    { lower: 0, upper: 1240000, rate: 10 },             // $0 - $12,400
    { lower: 1240000, upper: 5040000, rate: 12 },       // $12,400 - $50,400
    { lower: 5040000, upper: 10570000, rate: 22 },      // $50,400 - $105,700
    { lower: 10570000, upper: 20177500, rate: 24 },     // $105,700 - $201,775
    { lower: 20177500, upper: 25622500, rate: 32 },     // $201,775 - $256,225
    { lower: 25622500, upper: 64060000, rate: 35 },     // $256,225 - $640,600
    { lower: 64060000, upper: Infinity, rate: 37 }     // $640,600+
  ],
  married_filing_jointly: [
    { lower: 0, upper: 2480000, rate: 10 },             // $0 - $24,800
    { lower: 2480000, upper: 10080000, rate: 12 },      // $24,800 - $100,800
    { lower: 10080000, upper: 21140000, rate: 22 },     // $100,800 - $211,400
    { lower: 21140000, upper: 40355000, rate: 24 },     // $211,400 - $403,550
    { lower: 40355000, upper: 51245000, rate: 32 },     // $403,550 - $512,450
    { lower: 51245000, upper: 76870000, rate: 35 },     // $512,450 - $768,700
    { lower: 76870000, upper: Infinity, rate: 37 }     // $768,700+
  ],
  married_filing_separately: [
    { lower: 0, upper: 1240000, rate: 10 },             // $0 - $12,400
    { lower: 1240000, upper: 5040000, rate: 12 },       // $12,400 - $50,400
    { lower: 5040000, upper: 10570000, rate: 22 },      // $50,400 - $105,700
    { lower: 10570000, upper: 20177500, rate: 24 },     // $105,700 - $201,775
    { lower: 20177500, upper: 25622500, rate: 32 },     // $201,775 - $256,225
    { lower: 25622500, upper: 38435000, rate: 35 },     // $256,225 - $384,350
    { lower: 38435000, upper: Infinity, rate: 37 }     // $384,350+
  ],
  head_of_household: [
    { lower: 0, upper: 1770000, rate: 10 },             // $0 - $17,700
    { lower: 1770000, upper: 6745000, rate: 12 },       // $17,700 - $67,450
    { lower: 6745000, upper: 10570000, rate: 22 },      // $67,450 - $105,700
    { lower: 10570000, upper: 20177500, rate: 24 },     // $105,700 - $201,775
    { lower: 20177500, upper: 25620000, rate: 32 },     // $201,775 - $256,200
    { lower: 25620000, upper: 64060000, rate: 35 },     // $256,200 - $640,600
    { lower: 64060000, upper: Infinity, rate: 37 }     // $640,600+
  ]
};

/**
 * Tax on lower brackets (cumulative tax at each bracket floor).
 * total_tax = tax_on_lower[i] + (income − bracket.lower) × rate
 * All values in cents. Derived from FEDERAL_BRACKETS_2026 above.
 */
export const TAX_ON_LOWER_BRACKETS_2026: Record<string, number[]> = {
  single: [
    0,              // $0 at $0
    124000,         // $1,240 at $12,400
    580000,         // $5,800 at $50,400
    1796600,        // $17,966 at $105,700
    4102400,        // $41,024 at $201,775
    5844800,        // $58,448 at $256,225
    19297925       // $192,979 at $640,600
  ],
  married_filing_jointly: [
    0,              // $0 at $0
    248000,         // $2,480 at $24,800
    1160000,        // $11,600 at $100,800
    3593200,        // $35,932 at $211,400
    8204800,        // $82,048 at $403,550
    11689600,       // $116,896 at $512,450
    20658350       // $206,584 at $768,700
  ],
  married_filing_separately: [
    0,              // $0 at $0
    124000,         // $1,240 at $12,400
    580000,         // $5,800 at $50,400
    1796600,        // $17,966 at $105,700
    4102400,        // $41,024 at $201,775
    5844800,        // $58,448 at $256,225
    10329175       // $103,292 at $384,350
  ],
  head_of_household: [
    0,              // $0 at $0
    177000,         // $1,770 at $17,700
    774000,         // $7,740 at $67,450
    1615500,        // $16,155 at $105,700
    3921300,        // $39,213 at $201,775
    5662900,        // $56,629 at $256,200
    19116900       // $191,169 at $640,600
  ]
};
// Fallback inflation for years beyond the published table. Real thresholds
// track chained CPI (~2-3%/yr); replace with published figures as they land.
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
 *
 * If exact rate not found, finds the highest bracket <= maxRate
 * This handles cases where users enter values like 25% (not a real bracket)
 */
export function getBracketCeiling(filingStatus: string, maxRate: number, year: number = 2026): number {
  const brackets = getFederalBrackets(year, filingStatus);

  // First try exact match
  const exactMatch = brackets.find(b => b.rate === maxRate);
  if (exactMatch) {
    return exactMatch.upper;
  }

  // No exact match - find highest bracket with rate <= maxRate
  // This handles invalid rates like 25% by using the 24% bracket
  const validBrackets = brackets.filter(b => b.rate <= maxRate);
  if (validBrackets.length > 0) {
    // Get the highest rate bracket that's still <= maxRate
    const bestBracket = validBrackets[validBrackets.length - 1];
    return bestBracket.upper;
  }

  // No valid bracket found (maxRate < 10%) - return 0
  return 0;
}
