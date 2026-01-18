/**
 * Federal Poverty Level (FPL) data for ACA calculations
 * All values in cents
 * Source: HHS Poverty Guidelines 2025
 */

export const FPL_2025 = {
  contiguous: {
    base: 1558000,      // $15,580 for 1 person
    perPerson: 548000   // $5,480 per additional person
  },
  alaska: {
    base: 1946000,      // $19,460 for 1 person
    perPerson: 686000   // $6,860 per additional person
  },
  hawaii: {
    base: 1792000,      // $17,920 for 1 person
    perPerson: 631000   // $6,310 per additional person
  }
};

const ALASKA_CODES = ['AK'];
const HAWAII_CODES = ['HI'];

/**
 * Get the Federal Poverty Level for a household
 */
export function getFPL(householdSize: number, state: string): number {
  let rates = FPL_2025.contiguous;

  if (ALASKA_CODES.includes(state)) {
    rates = FPL_2025.alaska;
  } else if (HAWAII_CODES.includes(state)) {
    rates = FPL_2025.hawaii;
  }

  return rates.base + (rates.perPerson * (householdSize - 1));
}

/**
 * Get the ACA subsidy cutoff (400% FPL)
 * Above this threshold, no premium tax credit is available
 */
export function getACASubsidyCutoff(householdSize: number, state: string): number {
  return getFPL(householdSize, state) * 4;
}

/**
 * Calculate MAGI as percentage of FPL
 */
export function getMAGIAsFPLPercent(
  magi: number,
  householdSize: number,
  state: string
): number {
  const fpl = getFPL(householdSize, state);
  return (magi / fpl) * 100;
}
