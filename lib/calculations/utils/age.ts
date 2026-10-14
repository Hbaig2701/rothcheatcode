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
 * Age the person reaches during `year` — the IRS convention for RMDs (owed for
 * the year you attain the age), the 65+ deductions and Medicare.
 */
export function getAgeReachedInYear(dob: string, year: number): number {
  return year - getBirthYear(dob);
}

interface ExactBirthDateFields {
  age: number;
  date_of_birth?: string | null;
  date_of_birth_exact?: boolean | null;
  spouse_age?: number | null;
  spouse_dob?: string | null;
  spouse_dob_exact?: boolean | null;
}

/**
 * When the advisor entered a real date of birth, the age the engine runs on is
 * the age reached during the current calendar year, recomputed each year so it
 * never goes stale. Without this the stored age is used, which is a year early
 * for anyone whose birthday hasn't passed (RMDs start a year late) and can put
 * a late-1959 birth on the wrong side of the 73/75 RMD line.
 *
 * Clients without an exact DOB come back unchanged (same object).
 */
export function withExactBirthDates<T extends ExactBirthDateFields>(
  client: T,
  currentYear: number = new Date().getFullYear(),
): T {
  const age = client.date_of_birth_exact && client.date_of_birth
    ? getAgeReachedInYear(client.date_of_birth, currentYear)
    : client.age;
  const spouseAge = client.spouse_dob_exact && client.spouse_dob
    ? getAgeReachedInYear(client.spouse_dob, currentYear)
    : client.spouse_age;
  if (age === client.age && spouseAge === client.spouse_age) return client;
  return { ...client, age, spouse_age: spouseAge };
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
 * Birth year for a client, preferring the entered `age` (the engine's primary
 * input) and falling back to DOB. Centralizes the derivation so DISPLAY
 * surfaces (report dashboard, Story Mode, PDF) compute the same RMD start age
 * the engine uses — and uses the string-parsing getBirthYear() so it never
 * hits the `new Date(dob).getFullYear()` timezone bug (which returns the year
 * minus one in US timezones).
 */
export function getClientBirthYear(
  client: { age?: number | null; date_of_birth?: string | null },
  currentYear: number = new Date().getFullYear(),
): number {
  if (client.age != null && client.age > 0) return getBirthYearFromAge(client.age, currentYear);
  if (client.date_of_birth) return getBirthYear(client.date_of_birth);
  return currentYear - 65;
}

/**
 * The client's RMD start age (SECURE 2.0: 73 for born ≤1959, 75 for 1960+).
 * Use this anywhere the report/PDF/Story Mode needs to state when RMDs begin —
 * never hardcode 73.
 */
export function getClientRMDStartAge(
  client: { age?: number | null; date_of_birth?: string | null },
  currentYear: number = new Date().getFullYear(),
): number {
  return getRMDStartAge(getClientBirthYear(client, currentYear));
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
