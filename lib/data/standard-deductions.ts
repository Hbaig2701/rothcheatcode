/**
 * 2026 Standard Deductions
 * All values in cents
 */
export const STANDARD_DEDUCTIONS_2026: Record<string, number> = {
  single: 1525000,                    // $15,250
  married_filing_jointly: 3050000,    // $30,500
  married_filing_separately: 1525000, // $15,250
  head_of_household: 2290000,         // $22,900
  senior_single_additional: 195000,   // $1,950 additional for 65+
  senior_married_additional: 155000   // $1,550 per spouse 65+
};

/**
 * Calculate standard deduction with senior bonus
 * @param status Filing status
 * @param age Primary taxpayer age
 * @param spouseAge Spouse age (for married filers)
 */
export function getStandardDeduction(
  status: string,
  age: number,
  spouseAge?: number
): number {
  const baseDeduction = STANDARD_DEDUCTIONS_2026[status] ?? STANDARD_DEDUCTIONS_2026.single;

  let seniorBonus = 0;

  if (status === 'married_filing_jointly' || status === 'married_filing_separately') {
    // Married: add bonus for each spouse 65+
    if (age >= 65) {
      seniorBonus += STANDARD_DEDUCTIONS_2026.senior_married_additional;
    }
    if (spouseAge && spouseAge >= 65) {
      seniorBonus += STANDARD_DEDUCTIONS_2026.senior_married_additional;
    }
  } else {
    // Single/HoH: use single additional amount
    if (age >= 65) {
      seniorBonus += STANDARD_DEDUCTIONS_2026.senior_single_additional;
    }
  }

  return baseDeduction + seniorBonus;
}
