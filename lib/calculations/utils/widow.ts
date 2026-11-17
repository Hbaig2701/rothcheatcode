import type { Client } from '@/lib/types/client';
import type { FilingStatus } from '../types';

/**
 * Widow's penalty modeling — shared by the Roth engines (baseline.ts,
 * growth-formula.ts, formula.ts) and the widow analysis card.
 *
 * When an MFJ client has "Widow Analysis" on, the projection assumes the first
 * spouse dies in getFirstDeathYear(). From that year on BOTH sides (do-nothing
 * and strategy) file Single: narrower brackets, the single standard deduction,
 * Single IRMAA thresholds, and one Social Security check (the larger of the
 * two — the survivor benefit) instead of two. The accounts carry on unchanged
 * in the survivor's hands (spousal rollover; RMD schedule unchanged).
 *
 * Before v90 this was a side card only: the headline stayed married-joint for
 * the whole projection, understating the cost of leaving money in the IRA.
 */

/** True when this client's projection should model the first death. */
export function isWidowModeled(client: Pick<Client, 'widow_analysis' | 'filing_status'>): boolean {
  return client.widow_analysis === true && client.filing_status === 'married_filing_jointly';
}

/**
 * Calendar year of the first death. Priority:
 *   1. `client.widow_death_age` — advisor's explicit "First-Death Age",
 *      anchored on the OLDER spouse's birth year.
 *   2. Older spouse's birth year + 85 (life-expectancy heuristic).
 *   3. 15 years from now (last-resort default).
 * A past year means "already widowed": every projection year is a survivor year.
 */
export function getFirstDeathYear(client: Client): number {
  const currentYear = new Date().getFullYear();

  // Parse the year from the string, NOT via `new Date(dob).getFullYear()` —
  // that reads ISO dates as UTC midnight and returns the prior year in US
  // timezones. Number.isFinite guards malformed DOB strings.
  const toBirthYear = (dob: string | null | undefined, age: number | null | undefined): number | null => {
    if (dob) {
      const parsed = parseInt(dob.substring(0, 4), 10);
      if (Number.isFinite(parsed)) return parsed;
    }
    if (age != null && Number.isFinite(age) && age > 0) {
      return currentYear - age;
    }
    return null;
  };

  const clientBirthYear = toBirthYear(client.date_of_birth, client.age);
  const spouseBirthYear = toBirthYear(client.spouse_dob, client.spouse_age);
  const olderBirthYear = clientBirthYear !== null && spouseBirthYear !== null
    ? Math.min(clientBirthYear, spouseBirthYear)
    : (clientBirthYear ?? spouseBirthYear);

  if (client.widow_death_age != null) {
    return olderBirthYear !== null
      ? olderBirthYear + client.widow_death_age
      : currentYear + client.widow_death_age;
  }
  if (olderBirthYear !== null) return olderBirthYear + 85;
  return currentYear + 15;
}

/**
 * Per-projection resolver: returns a function that tells the engine, for a
 * given calendar year, whether the survivor files Single and which filing
 * status to use. Resolve once per run (outside the year loop).
 */
export function makeSurvivorResolver(client: Client): (year: number) => {
  survivor: boolean;
  filingStatus: FilingStatus;
} {
  const married = { survivor: false, filingStatus: client.filing_status as FilingStatus };
  if (!isWidowModeled(client)) return () => married;
  const deathYear = getFirstDeathYear(client);
  const single = { survivor: true, filingStatus: 'single' as FilingStatus };
  return (year: number) => (year >= deathYear ? single : married);
}

/**
 * Household Social Security for the year. Married: both checks. Survivor: the
 * larger of the two (Social Security survivor rule — the survivor keeps
 * whichever benefit is bigger, not both).
 */
export function householdSocialSecurity(primary: number, spouse: number, survivor: boolean): number {
  return survivor ? Math.max(primary, spouse) : primary + spouse;
}
