/**
 * After-tax IRA basis (Form 8606) — the pro-rata rule.
 *
 * A client who made nondeductible IRA contributions (or rolled after-tax
 * 401(k) money into the IRA) has BASIS: dollars already taxed. Every dollar
 * that leaves the IRA — conversion, RMD, voluntary withdrawal, tax withheld —
 * is tax-free in the ratio
 *
 *     remaining basis ÷ (year-end IRA value + this year's distributions)
 *
 * (Form 8606 lines 3 / 6–8), and the basis is used up by the tax-free amount.
 * You cannot convert "just the basis".
 *
 * The engines take distributions at the start of the year and grow what is
 * left, so the 8606 denominator is
 *
 *     year-end value + D = (BOY − D) × (1 + g) + D = BOY + (BOY − D) × g
 *
 * which depends on D. Because of that the tax-free amount is a FUNCTION of the
 * year's total distribution rather than a fixed rate: converting more raises
 * the ratio slightly (less year-end value left), and draining the IRA
 * (D = BOY) recovers exactly the whole remaining basis — no basis is stranded.
 *
 * With no basis every helper is the identity (taxable(D) === D,
 * grossFor(_, t) === t), so engines that route through it stay byte-identical
 * for the >99% of clients who leave the field at $0.
 *
 * All amounts in cents.
 */
export interface BasisYear {
  /** True when this year has basis to recover. */
  active: boolean;
  /** Tax-free part of a total IRA distribution D this year. */
  nontaxable(D: number): number;
  /** Taxable part of a total IRA distribution D this year. */
  taxable(D: number): number;
  /** Taxable income added by distributing `amount` on top of `base`. */
  incTaxable(base: number, amount: number): number;
  /**
   * Gross distribution on top of `base` whose INCREMENTAL taxable income is
   * `targetTaxable` — the inverse of incTaxable. Used to turn a planner's
   * taxable bracket/IRMAA room into the larger gross conversion it allows.
   * Capped at what is left in the IRA.
   */
  grossFor(base: number, targetTaxable: number): number;
}

export function makeBasisYear(remainingBasis: number, boyIra: number, growthRate: number): BasisYear {
  const active = remainingBasis > 0 && boyIra > 0;
  if (!active) {
    return {
      active: false,
      nontaxable: () => 0,
      taxable: (D) => D,
      incTaxable: (_base, amount) => amount,
      grossFor: (_base, t) => t,
    };
  }
  const g = Number.isFinite(growthRate) && growthRate > -0.99 ? growthRate : 0;
  const nontaxable = (D: number): number => {
    if (!(D > 0)) return 0;
    const d = Math.min(D, boyIra);
    const denom = boyIra + (boyIra - d) * g;
    if (!(denom > 0)) return Math.min(remainingBasis, d);
    return Math.min(remainingBasis, d, Math.round((remainingBasis * d) / denom));
  };
  const taxable = (D: number): number => Math.max(0, D) - nontaxable(D);
  const incTaxable = (base: number, amount: number): number =>
    taxable(base + amount) - taxable(base);
  const grossFor = (base: number, targetTaxable: number): number => {
    if (!(targetTaxable > 0)) return 0;
    const maxAmt = Math.max(0, boyIra - base);
    if (incTaxable(base, maxAmt) <= targetTaxable) return maxAmt;
    // incTaxable is monotone non-decreasing in amount; bisect to the cent.
    let lo = targetTaxable; // gross is never below the taxable target
    let hi = maxAmt;
    if (lo >= hi) return hi;
    for (let i = 0; i < 60 && hi - lo > 1; i++) {
      const mid = (lo + hi) / 2;
      if (incTaxable(base, mid) <= targetTaxable) lo = mid; else hi = mid;
    }
    return Math.floor(lo);
  };
  return { active, nontaxable, taxable, incTaxable, grossFor };
}
