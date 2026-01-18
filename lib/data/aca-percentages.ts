/**
 * ACA Applicable Percentage Tables
 * Used to calculate expected premium contribution as % of income
 * Source: IRS Rev. Proc. 2024-35, Healthcare.gov
 */

export interface ApplicablePercentBracket {
  minFPL: number;   // Starting FPL percentage
  maxFPL: number;   // Ending FPL percentage
  minPct: number | null;  // Starting applicable percentage
  maxPct: number | null;  // Ending applicable percentage (null = no subsidy)
}

/**
 * 2025 Enhanced Credits (ARPA/IRA extended)
 * No cliff at 400% - caps at 8.5% for all income levels above 400% FPL
 */
export const APPLICABLE_PERCENTAGES_2025: ApplicablePercentBracket[] = [
  { minFPL: 0, maxFPL: 150, minPct: 0, maxPct: 0 },
  { minFPL: 150, maxFPL: 200, minPct: 0, maxPct: 2 },
  { minFPL: 200, maxFPL: 250, minPct: 2, maxPct: 4 },
  { minFPL: 250, maxFPL: 300, minPct: 4, maxPct: 6 },
  { minFPL: 300, maxFPL: 400, minPct: 6, maxPct: 8.5 },
  { minFPL: 400, maxFPL: Infinity, minPct: 8.5, maxPct: 8.5 }, // Capped, no cliff
];

/**
 * 2026+ Standard Credits (if enhanced credits expire)
 * Hard cliff at 400% FPL - no subsidy above that
 */
export const APPLICABLE_PERCENTAGES_2026: ApplicablePercentBracket[] = [
  { minFPL: 100, maxFPL: 133, minPct: 2.10, maxPct: 2.10 },
  { minFPL: 133, maxFPL: 150, minPct: 3.14, maxPct: 4.19 },
  { minFPL: 150, maxFPL: 200, minPct: 4.19, maxPct: 6.52 },
  { minFPL: 200, maxFPL: 250, minPct: 6.52, maxPct: 8.33 },
  { minFPL: 250, maxFPL: 300, minPct: 8.33, maxPct: 9.83 },
  { minFPL: 300, maxFPL: 400, minPct: 9.83, maxPct: 9.83 },
  { minFPL: 400, maxFPL: Infinity, minPct: null, maxPct: null }, // NO SUBSIDY
];

/**
 * Estimated benchmark premiums by age (annual, in cents)
 * SLCSP (Second Lowest Cost Silver Plan) averages
 * Source: KFF analysis of marketplace data
 */
export const ESTIMATED_BENCHMARKS: Record<string, number> = {
  '40': 480000,   // ~$4,800/year for 40yo
  '50': 660000,   // ~$6,600/year for 50yo
  '60': 960000,   // ~$9,600/year for 60yo
  '64': 1080000,  // ~$10,800/year for 64yo
  'couple_60': 1920000, // ~$19,200/year for couple age 60
};

/**
 * Get applicable percentage for a given FPL percentage and year
 * Uses linear interpolation within brackets
 * Returns null if above cliff (2026+) - indicates no subsidy
 */
export function getApplicablePercentage(
  fplPercent: number,
  year: number
): number | null {
  const table = year <= 2025
    ? APPLICABLE_PERCENTAGES_2025
    : APPLICABLE_PERCENTAGES_2026;

  const bracket = table.find(
    b => fplPercent >= b.minFPL && fplPercent < b.maxFPL
  );

  if (!bracket || bracket.minPct === null) {
    return null; // Above cliff or below minimum
  }

  // Handle single-value brackets
  if (bracket.minPct === bracket.maxPct) {
    return bracket.minPct;
  }

  // Linear interpolation within bracket
  const range = bracket.maxFPL - bracket.minFPL;
  const position = (fplPercent - bracket.minFPL) / range;
  return bracket.minPct + position * (bracket.maxPct! - bracket.minPct);
}

/**
 * Get estimated benchmark premium based on age
 * Returns annual amount in cents
 */
export function getEstimatedBenchmark(age: number, isCouple: boolean): number {
  if (isCouple && age >= 60) return ESTIMATED_BENCHMARKS['couple_60'];
  if (age >= 64) return ESTIMATED_BENCHMARKS['64'];
  if (age >= 60) return ESTIMATED_BENCHMARKS['60'];
  if (age >= 50) return ESTIMATED_BENCHMARKS['50'];
  return ESTIMATED_BENCHMARKS['40'];
}
