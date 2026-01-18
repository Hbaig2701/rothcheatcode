import type { TaxBracket } from '@/lib/calculations/types';

/**
 * Progressive state tax brackets for top states
 * All threshold values in cents
 * Note: For simplicity, only includes single/married_jointly
 * Other filing statuses fall back to single brackets
 */
export const STATE_TAX_BRACKETS: Record<string, { single: TaxBracket[], married_jointly: TaxBracket[] }> = {
  CA: {
    single: [
      { lower: 0, upper: 1096900, rate: 1.0 },
      { lower: 1096900, upper: 2601600, rate: 2.0 },
      { lower: 2601600, upper: 4103700, rate: 4.0 },
      { lower: 4103700, upper: 5694400, rate: 6.0 },
      { lower: 5694400, upper: 7187600, rate: 8.0 },
      { lower: 7187600, upper: 36663800, rate: 9.3 },
      { lower: 36663800, upper: 43996500, rate: 10.3 },
      { lower: 43996500, upper: 73327500, rate: 11.3 },
      { lower: 73327500, upper: 146655100, rate: 12.3 },
      { lower: 146655100, upper: Infinity, rate: 13.3 }
    ],
    married_jointly: [
      { lower: 0, upper: 2193800, rate: 1.0 },
      { lower: 2193800, upper: 5203200, rate: 2.0 },
      { lower: 5203200, upper: 8207400, rate: 4.0 },
      { lower: 8207400, upper: 11388800, rate: 6.0 },
      { lower: 11388800, upper: 14375200, rate: 8.0 },
      { lower: 14375200, upper: 73327600, rate: 9.3 },
      { lower: 73327600, upper: 87993000, rate: 10.3 },
      { lower: 87993000, upper: 146655000, rate: 11.3 },
      { lower: 146655000, upper: 293310200, rate: 12.3 },
      { lower: 293310200, upper: Infinity, rate: 13.3 }
    ]
  },
  NY: {
    single: [
      { lower: 0, upper: 850000, rate: 4.0 },
      { lower: 850000, upper: 1137000, rate: 4.5 },
      { lower: 1137000, upper: 1349000, rate: 5.25 },
      { lower: 1349000, upper: 2145000, rate: 5.5 },
      { lower: 2145000, upper: 8000000, rate: 6.0 },
      { lower: 8000000, upper: 13500000, rate: 6.85 },
      { lower: 13500000, upper: 21500000, rate: 9.65 },
      { lower: 21500000, upper: 100000000, rate: 10.3 },
      { lower: 100000000, upper: Infinity, rate: 10.9 }
    ],
    married_jointly: [
      { lower: 0, upper: 1700000, rate: 4.0 },
      { lower: 1700000, upper: 2274000, rate: 4.5 },
      { lower: 2274000, upper: 2698000, rate: 5.25 },
      { lower: 2698000, upper: 32390000, rate: 5.5 },
      { lower: 32390000, upper: 161550000, rate: 6.0 },
      { lower: 161550000, upper: 215400000, rate: 6.85 },
      { lower: 215400000, upper: 323100000, rate: 9.65 },
      { lower: 323100000, upper: 2693750000, rate: 10.3 },
      { lower: 2693750000, upper: Infinity, rate: 10.9 }
    ]
  },
  NJ: {
    single: [
      { lower: 0, upper: 2000000, rate: 1.4 },
      { lower: 2000000, upper: 3500000, rate: 1.75 },
      { lower: 3500000, upper: 4000000, rate: 3.5 },
      { lower: 4000000, upper: 7500000, rate: 5.525 },
      { lower: 7500000, upper: 50000000, rate: 6.37 },
      { lower: 50000000, upper: 100000000, rate: 8.97 },
      { lower: 100000000, upper: Infinity, rate: 10.75 }
    ],
    married_jointly: [
      { lower: 0, upper: 2000000, rate: 1.4 },
      { lower: 2000000, upper: 3500000, rate: 1.75 },
      { lower: 3500000, upper: 4000000, rate: 3.5 },
      { lower: 4000000, upper: 7500000, rate: 5.525 },
      { lower: 7500000, upper: 50000000, rate: 6.37 },
      { lower: 50000000, upper: 100000000, rate: 8.97 },
      { lower: 100000000, upper: Infinity, rate: 10.75 }
    ]
  }
};

/**
 * Get state tax brackets if available
 * Returns null for states without progressive brackets in our data
 */
export function getStateBrackets(
  state: string,
  filingStatus: string
): TaxBracket[] | null {
  const stateBrackets = STATE_TAX_BRACKETS[state];
  if (!stateBrackets) return null;

  if (filingStatus === 'married_filing_jointly') {
    return stateBrackets.married_jointly;
  }
  return stateBrackets.single;
}
