/**
 * Exact date of birth — age derivation, RMD timing, save fields, validation.
 *
 * Run: npx tsx lib/calculations/__tests__/audit/exact-birth-date.test.ts
 *
 * With an exact DOB the engine runs on the age reached during the calendar
 * year (withExactBirthDates). Two failures of the age-only input this fixes:
 *   1. RMDs a year late for anyone whose birthday hasn't passed (Jason Beyer /
 *      Jainarayn Singh: 72 now, 73 in a month, owes an RMD this year).
 *   2. A late-1959 birth entered by current age derives birth year 1960 and
 *      gets RMD age 75 instead of 73.
 */

import { makeClient, dispatch } from './factory';
import { Reporter } from './assertions';
import { withExactBirthDates } from '../../utils/age';
import { createSimulationInput } from '../../engine';
import { birthDateFieldsForSave } from '@/lib/utils/birth-dates';
import { clientFullSchema } from '@/lib/validations/client';
import type { Client } from '@/lib/types/client';

const r = new Reporter();
const YEAR = 2026;

function check(fixture: string, checkName: string, ok: boolean, expected?: number, actual?: number, note?: string) {
  r.ran();
  if (!ok) r.record({ fixture, scenario: 'baseline', check: checkName, expected, actual, note });
}

// Route-equivalent: derive ages, then run the engine.
function runExact(overrides: Partial<Client>) {
  return dispatch(withExactBirthDates(makeClient(overrides), YEAR), YEAR);
}
const firstRmdAge = (years: { age: number; rmdAmount: number }[]) => years.find((y) => y.rmdAmount > 0)?.age;

const noConv = { conversion_type: 'no_conversion' as const, qualified_account_value: 100_000_000, end_age: 95 };

// 1. Birthday later this year: 72 today, turns 73 in November → RMD in 2026.
{
  const exact = runExact({ ...noConv, age: 72, date_of_birth: '1953-11-15', date_of_birth_exact: true });
  const ageOnly = dispatch(makeClient({ ...noConv, age: 72, date_of_birth: '1954-01-01' }), YEAR);
  check('nov-1953', 'derived-age', exact.client.age === 73, 73, exact.client.age);
  check('nov-1953', 'rmd-in-first-year', exact.baseline[0].rmdAmount > 0, undefined, exact.baseline[0].rmdAmount,
    'exact DOB: 2026 is the year he reaches 73, so the first RMD is owed this year');
  // Uniform Lifetime Table, age 73 → 26.5 on the starting $1M.
  const expected = Math.round(100_000_000 / 26.5);
  check('nov-1953', 'rmd-amount', Math.abs(exact.baseline[0].rmdAmount - expected) <= 500, expected, exact.baseline[0].rmdAmount);
  check('nov-1953', 'age-only-is-a-year-late', ageOnly.baseline[0].rmdAmount === 0 && firstRmdAge(ageOnly.baseline) === 73,
    undefined, ageOnly.baseline[0].rmdAmount, 'contrast: entered as 72 the first RMD lands in 2027');
}

// 2. The 1959/1960 line: born Nov 1959, 66 today → RMD age 73, not 75.
{
  const exact = runExact({ ...noConv, age: 66, date_of_birth: '1959-11-20', date_of_birth_exact: true });
  const ageOnly = dispatch(makeClient({ ...noConv, age: 66, date_of_birth: '1960-01-01' }), YEAR);
  check('nov-1959', 'derived-age', exact.client.age === 67, 67, exact.client.age);
  check('nov-1959', 'rmd-start-73', firstRmdAge(exact.baseline) === 73, 73, firstRmdAge(exact.baseline));
  check('nov-1959', 'rmd-calendar-year', exact.baseline.find((y) => y.rmdAmount > 0)?.year === 2032, 2032,
    exact.baseline.find((y) => y.rmdAmount > 0)?.year);
  check('nov-1959', 'age-only-says-75', firstRmdAge(ageOnly.baseline) === 75, 75, firstRmdAge(ageOnly.baseline),
    'contrast: the age-only input lands on the wrong side of the line');
}

// 3. Spouse DOB on a joint return: spouse reaches 65 in December → her 65+
//    standard deduction counts for 2026.
{
  const base = { ...noConv, filing_status: 'married_filing_jointly' as const, age: 71, date_of_birth: '1955-03-01', date_of_birth_exact: true };
  const exact = runExact({ ...base, spouse_age: 64, spouse_dob: '1961-12-30', spouse_dob_exact: true });
  const ageOnly = runExact({ ...base, spouse_age: 64 });
  check('spouse-dec-1961', 'derived-spouse-age', exact.client.spouse_age === 65, 65, exact.client.spouse_age ?? undefined);
  // 2026 MFJ $32,200 + $1,650 per spouse 65+.
  check('spouse-dec-1961', 'std-deduction-both-65', exact.baseline[0].standardDeduction === 3_550_000, 3_550_000, exact.baseline[0].standardDeduction);
  check('spouse-dec-1961', 'std-deduction-age-only', ageOnly.baseline[0].standardDeduction === 3_385_000, 3_385_000, ageOnly.baseline[0].standardDeduction);
}

// 4. No exact DOB → untouched (same object), so existing clients are byte-identical.
{
  const c = makeClient({ age: 70, date_of_birth: '1956-01-01' });
  check('age-mode', 'identity', withExactBirthDates(c, YEAR) === c);
  const flagWithoutDate = makeClient({ age: 70, date_of_birth: null, date_of_birth_exact: true });
  check('age-mode', 'flag-without-date-ignored', withExactBirthDates(flagWithoutDate, YEAR).age === 70, 70, withExactBirthDates(flagWithoutDate, YEAR).age);
}

// 5. createSimulationInput applies it (every engine entry point goes through it).
{
  const now = new Date().getFullYear();
  const c = makeClient({ age: 50, end_age: 95, date_of_birth: '1953-06-01', date_of_birth_exact: true });
  const input = createSimulationInput(c);
  check('sim-input', 'derived-age', input.client.age === now - 1953, now - 1953, input.client.age);
  check('sim-input', 'horizon-from-derived-age', input.endYear - input.startYear + 1 === 95 - (now - 1953), 95 - (now - 1953), input.endYear - input.startYear + 1);
}

// 6. Save fields.
{
  const ageMode = birthDateFieldsForSave({ filing_status: 'single', age: 66 }, null, YEAR);
  check('save', 'synthesized-dob', ageMode.date_of_birth === '1960-01-01', undefined, undefined, ageMode.date_of_birth);
  check('save', 'flags-omitted', ageMode.date_of_birth_exact === undefined && ageMode.spouse_dob_exact === undefined,
    undefined, undefined, 'ordinary saves must not send the new columns');

  const exact = birthDateFieldsForSave({ filing_status: 'single', age: 73, date_of_birth: '1953-11-15', date_of_birth_exact: true }, null, YEAR);
  check('save', 'exact-dob-kept', exact.date_of_birth === '1953-11-15' && exact.date_of_birth_exact === true);

  const switchedOff = birthDateFieldsForSave({ filing_status: 'single', age: 73, date_of_birth: '1953-11-15', date_of_birth_exact: false }, { date_of_birth_exact: true }, YEAR);
  check('save', 'switch-off-clears', switchedOff.date_of_birth_exact === false && switchedOff.date_of_birth === '1953-01-01');

  const mfs = birthDateFieldsForSave({ filing_status: 'married_filing_separately', age: 66, spouse_age: 64, spouse_dob: '1962-05-05', spouse_dob_exact: true }, null, YEAR);
  check('save', 'mfs-no-spouse', mfs.spouse_dob === null && mfs.spouse_dob_exact === undefined);

  const mfj = birthDateFieldsForSave({ filing_status: 'married_filing_jointly', age: 66, spouse_age: 65, spouse_dob: '1961-12-30', spouse_dob_exact: true }, null, YEAR);
  check('save', 'mfj-spouse-exact', mfj.spouse_dob === '1961-12-30' && mfj.spouse_dob_exact === true);
}

// 7. Creating a married-filing-separately client (no spouse DOB) validates.
{
  const c = makeClient({ filing_status: 'married_filing_separately', date_of_birth: '1960-01-01', spouse_dob: null, spouse_age: null });
  const parsed = clientFullSchema.safeParse(c);
  check('schema', 'mfs-create-valid', parsed.success, undefined, undefined,
    parsed.success ? undefined : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
}

r.print('Exact date of birth');
process.exit(r.breaches.length > 0 ? 1 : 0);
