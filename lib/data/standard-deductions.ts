/**
 * 2026 Standard Deductions (Estimated)
 * All values in cents
 *
 * Source: Retirement Expert Specification v1.0
 * Note: Standard deduction increases ~3% annually for inflation
 */
export const STANDARD_DEDUCTIONS_2026: Record<string, number> = {
  single: 1610000,                    // $16,100
  married_filing_jointly: 3220000,    // $32,200
  married_filing_separately: 1610000, // $16,100
  head_of_household: 2415000,         // $24,150
  senior_single_additional: 200000,   // $2,000 additional for 65+
  senior_married_additional: 160000   // $1,600 per spouse 65+
};

// 3% annual inflation rate for deduction adjustments
const DEDUCTION_INFLATION_RATE = 0.03;

/**
 * Calculate standard deduction with senior bonus
 * @param status Filing status
 * @param age Primary taxpayer age
 * @param spouseAge Spouse age (for married filers)
 * @param year Tax year (for inflation adjustment)
 */
export function getStandardDeduction(
  status: string,
  age: number,
  spouseAge?: number,
  year: number = 2026
): number {
  let baseDeduction = STANDARD_DEDUCTIONS_2026[status] ?? STANDARD_DEDUCTIONS_2026.single;

  // Apply inflation adjustment for years beyond 2026
  if (year > 2026) {
    const yearsFromBase = year - 2026;
    const inflationFactor = Math.pow(1 + DEDUCTION_INFLATION_RATE, yearsFromBase);
    baseDeduction = Math.round(baseDeduction * inflationFactor / 100) * 100;
  }

  let seniorBonus = 0;
  let seniorBonusPerSpouse = STANDARD_DEDUCTIONS_2026.senior_married_additional;
  let seniorBonusSingle = STANDARD_DEDUCTIONS_2026.senior_single_additional;

  // Apply inflation to senior bonuses
  if (year > 2026) {
    const yearsFromBase = year - 2026;
    const inflationFactor = Math.pow(1 + DEDUCTION_INFLATION_RATE, yearsFromBase);
    seniorBonusPerSpouse = Math.round(seniorBonusPerSpouse * inflationFactor / 100) * 100;
    seniorBonusSingle = Math.round(seniorBonusSingle * inflationFactor / 100) * 100;
  }

  if (status === 'married_filing_jointly' || status === 'married_filing_separately') {
    // Married: add bonus for each spouse 65+
    if (age >= 65) {
      seniorBonus += seniorBonusPerSpouse;
    }
    if (spouseAge && spouseAge >= 65) {
      seniorBonus += seniorBonusPerSpouse;
    }
  } else {
    // Single/HoH: use single additional amount
    if (age >= 65) {
      seniorBonus += seniorBonusSingle;
    }
  }

  return baseDeduction + seniorBonus;
}

/**
 * Total deduction used to compute taxable income: the age-adjusted standard
 * deduction PLUS any advisor-entered additional deductions (charitable,
 * itemized above the standard, business losses/NOLs, leveraged-deduction
 * programs, etc.). Added on top of the standard deduction — the field is
 * labeled "additional deductions" so this is the advisor's mental model.
 *
 * Every tax-computing scenario must use THIS, not getStandardDeduction
 * directly, so the additional deduction is applied consistently across all
 * engines (the standardDeduction stored on each YearlyResult is the effective
 * value, which the marginal-conversion-tax and PDF paths read back).
 */
export function getEffectiveDeduction(
  status: string,
  age: number,
  spouseAge: number | undefined,
  year: number | undefined,
  additionalDeductions?: number | null
): number {
  return (
    getStandardDeduction(status, age, spouseAge, year) +
    Math.max(0, additionalDeductions ?? 0)
  );
}
