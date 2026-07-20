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

// ── OBBA "senior bonus" deduction (One Big Beautiful Bill Act, 2025) ────────
// A NEW deduction on top of the standard deduction and the older age-65
// additional standard deduction above. $6,000 per eligible individual 65+,
// available for tax years 2025–2028 only, phasing out at 6% of MAGI over the
// threshold. Not inflation-indexed (fixed amount + fixed thresholds).
//
// Per-person structure is what produces the published phase-out endpoints:
//   single/HoH: $6,000 fully gone at $175k ($75k + $6,000/0.06)
//   MFJ both 65+: $12,000 fully gone at $250k (two people × 6% ≈ 12% effective)
// Verified against the IRS worked example: MFJ, MAGI $178k → $8,640.
const OBBA_SENIOR_DEDUCTION_PER_PERSON = 600000; // $6,000 in cents
const OBBA_PHASEOUT_RATE = 0.06;                 // 6% of MAGI over threshold
const OBBA_FIRST_YEAR = 2025;
const OBBA_LAST_YEAR = 2028;                      // sunsets after 2028
const OBBA_THRESHOLD_JOINT = 15000000;            // $150,000 (MFJ)
const OBBA_THRESHOLD_OTHER = 7500000;             // $75,000 (single/HoH/MFS)

/**
 * OBBA senior bonus deduction (cents) for a given year and income.
 *
 * @param filingStatus  Filing status string
 * @param magi          Modified AGI in cents. We pass AGI (otherIncome +
 *                      taxable SS); MAGI only adds back §911/931/933 foreign
 *                      exclusions, which this app does not model, so AGI is
 *                      exact here.
 * @param age           Primary taxpayer age in the tax year
 * @param spouseAge     Spouse age (MFJ only)
 * @param year          Tax year — returns 0 outside 2025–2028
 * @returns             Additional deduction in cents (0 if not eligible)
 */
export function getSeniorBonusDeduction(
  filingStatus: string,
  magi: number,
  age: number,
  spouseAge: number | undefined,
  year: number
): number {
  if (year < OBBA_FIRST_YEAR || year > OBBA_LAST_YEAR) return 0;

  const isJoint = filingStatus === 'married_filing_jointly';

  // Count eligible seniors (65+). On a joint return both spouses can each
  // claim; on any other return only the taxpayer.
  let eligible = 0;
  if (age >= 65) eligible += 1;
  if (isJoint && (spouseAge ?? 0) >= 65) eligible += 1;
  if (eligible === 0) return 0;

  const threshold = isJoint ? OBBA_THRESHOLD_JOINT : OBBA_THRESHOLD_OTHER;
  const excess = Math.max(0, magi - threshold);
  // Each person's $6,000 is reduced by 6% of the MAGI excess, floored at $0.
  const perPerson = Math.max(0, OBBA_SENIOR_DEDUCTION_PER_PERSON - OBBA_PHASEOUT_RATE * excess);

  return Math.round(eligible * perPerson);
}

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
