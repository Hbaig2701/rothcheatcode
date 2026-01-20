/**
 * Age Utility Functions
 * Handles age calculations from dates and RMD age determination
 */

/**
 * Calculates age as of a specific year
 * @param dob - Date of birth in ISO format (YYYY-MM-DD) or null if using direct age
 * @param asOfYear - Year to calculate age for
 * @returns Age in years (age they turn that year)
 */
export function calculateAge(dob: string | null, asOfYear: number): number {
  if (!dob) {
    throw new Error('DOB required when using calculateAge');
  }
  const birthYear = parseInt(dob.substring(0, 4), 10);
  return asOfYear - birthYear;
}

/**
 * Calculates age at a given year offset using the direct age field
 * @param currentAge - Client's current age
 * @param yearOffset - Number of years from current year (0 = this year)
 * @returns Age at that year
 */
export function getAgeAtYearOffset(currentAge: number, yearOffset: number): number {
  return currentAge + yearOffset;
}

/**
 * Gets the birth year from a DOB string
 * @param dob - Date of birth in ISO format (YYYY-MM-DD)
 * @returns Birth year
 */
export function getBirthYear(dob: string): number {
  return parseInt(dob.substring(0, 4), 10);
}

/**
 * Gets the birth year from current age
 * @param currentAge - Client's current age
 * @param currentYear - Current year
 * @returns Estimated birth year
 */
export function getBirthYearFromAge(currentAge: number, currentYear: number): number {
  return currentYear - currentAge;
}

/**
 * Determines RMD start age based on birth year (SECURE 2.0)
 * - Born 1951-1959: RMD starts at 73
 * - Born 1960 or later: RMD starts at 75
 *
 * @param birthYear - Year of birth
 * @returns Age when RMDs must begin
 */
export function getRMDStartAge(birthYear: number): number {
  // SECURE 2.0 rules:
  // - Born 1950 or earlier: 72 (already past this age by now)
  // - Born 1951-1959: 73
  // - Born 1960 or later: 75
  if (birthYear <= 1950) {
    return 72;
  } else if (birthYear <= 1959) {
    return 73;
  } else {
    return 75;
  }
}

/**
 * Calculates the year when a person reaches a target age
 * @param dob - Date of birth in ISO format (YYYY-MM-DD)
 * @param targetAge - Age to calculate year for
 * @returns Year when person reaches targetAge
 */
export function calculateYearFromAge(dob: string, targetAge: number): number {
  const birthYear = getBirthYear(dob);
  return birthYear + targetAge;
}

/**
 * Calculates life expectancy based on age and gender
 * Uses simplified IRS actuarial tables
 * @param currentAge - Current age
 * @returns Estimated remaining years
 */
export function getLifeExpectancy(currentAge: number): number {
  // Simplified life expectancy table based on SSA actuarial data
  // Returns total expected age (not remaining years)
  if (currentAge < 50) return 85;
  if (currentAge < 55) return 85;
  if (currentAge < 60) return 86;
  if (currentAge < 65) return 86;
  if (currentAge < 70) return 87;
  if (currentAge < 75) return 88;
  if (currentAge < 80) return 89;
  if (currentAge < 85) return 91;
  if (currentAge < 90) return 94;
  return currentAge + 5; // For very elderly, assume at least 5 more years
}
