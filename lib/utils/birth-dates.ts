/**
 * Date-of-birth fields for a client save (client form + report Inputs drawer).
 *
 * An exact DOB the advisor entered is stored as-is. Otherwise date_of_birth is
 * synthesized from Age as Jan 1 of (current year - age), as before — those
 * synthesized dates carry no information beyond the age.
 *
 * The *_exact flags come back `undefined` unless they're on (or being switched
 * off), so JSON drops them and ordinary saves never touch the new columns.
 * Spread this AFTER the form data so it wins.
 */

interface BirthDateFormFields {
  filing_status: string;
  age: number;
  spouse_age?: number | null;
  date_of_birth?: string | null;
  date_of_birth_exact?: boolean;
  spouse_dob?: string | null;
  spouse_dob_exact?: boolean;
}

interface PriorBirthDateFlags {
  date_of_birth_exact?: boolean | null;
  spouse_dob_exact?: boolean | null;
}

export function birthDateFieldsForSave(
  data: BirthDateFormFields,
  prior?: PriorBirthDateFlags | null,
  currentYear: number = new Date().getFullYear(),
) {
  const exact = !!data.date_of_birth_exact && !!data.date_of_birth;
  // The spouse is only modelled on a joint return (the form hides the spouse
  // fields otherwise).
  const isJoint = data.filing_status === "married_filing_jointly";
  const spouseExact = isJoint && !!data.spouse_dob_exact && !!data.spouse_dob;

  return {
    date_of_birth: exact ? data.date_of_birth! : `${currentYear - data.age}-01-01`,
    spouse_dob: spouseExact
      ? data.spouse_dob!
      : isJoint && data.spouse_age
        ? `${currentYear - data.spouse_age}-01-01`
        : null,
    date_of_birth_exact: exact || prior?.date_of_birth_exact ? exact : undefined,
    spouse_dob_exact: spouseExact || prior?.spouse_dob_exact ? spouseExact : undefined,
  };
}
