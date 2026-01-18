import { TaxBracket } from '@/lib/calculations/types';

/**
 * 2026 Federal Tax Brackets
 * All threshold values in cents
 * Rates as percentages (e.g., 22 = 22%)
 */
export const FEDERAL_BRACKETS_2026: Record<string, TaxBracket[]> = {
  single: [
    { lower: 0, upper: 1180000, rate: 10 },           // $0 - $11,800
    { lower: 1180000, upper: 4800000, rate: 12 },     // $11,800 - $48,000
    { lower: 4800000, upper: 10300000, rate: 22 },    // $48,000 - $103,000
    { lower: 10300000, upper: 19700000, rate: 24 },   // $103,000 - $197,000
    { lower: 19700000, upper: 25000000, rate: 32 },   // $197,000 - $250,000
    { lower: 25000000, upper: 62600000, rate: 35 },   // $250,000 - $626,000
    { lower: 62600000, upper: Infinity, rate: 37 }    // $626,000+
  ],
  married_filing_jointly: [
    { lower: 0, upper: 2360000, rate: 10 },           // $0 - $23,600
    { lower: 2360000, upper: 9600000, rate: 12 },     // $23,600 - $96,000
    { lower: 9600000, upper: 20600000, rate: 22 },    // $96,000 - $206,000
    { lower: 20600000, upper: 39400000, rate: 24 },   // $206,000 - $394,000
    { lower: 39400000, upper: 50000000, rate: 32 },   // $394,000 - $500,000
    { lower: 50000000, upper: 75200000, rate: 35 },   // $500,000 - $752,000
    { lower: 75200000, upper: Infinity, rate: 37 }    // $752,000+
  ],
  married_filing_separately: [
    { lower: 0, upper: 1180000, rate: 10 },
    { lower: 1180000, upper: 4800000, rate: 12 },
    { lower: 4800000, upper: 10300000, rate: 22 },
    { lower: 10300000, upper: 19700000, rate: 24 },
    { lower: 19700000, upper: 25000000, rate: 32 },
    { lower: 25000000, upper: 37600000, rate: 35 },
    { lower: 37600000, upper: Infinity, rate: 37 }
  ],
  head_of_household: [
    { lower: 0, upper: 1680000, rate: 10 },           // $0 - $16,800
    { lower: 1680000, upper: 6400000, rate: 12 },     // $16,800 - $64,000
    { lower: 6400000, upper: 10300000, rate: 22 },    // $64,000 - $103,000
    { lower: 10300000, upper: 19700000, rate: 24 },   // $103,000 - $197,000
    { lower: 19700000, upper: 25000000, rate: 32 },   // $197,000 - $250,000
    { lower: 25000000, upper: 62600000, rate: 35 },   // $250,000 - $626,000
    { lower: 62600000, upper: Infinity, rate: 37 }    // $626,000+
  ]
};

const INFLATION_RATE = 0.027; // 2.7% assumed annual inflation

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
