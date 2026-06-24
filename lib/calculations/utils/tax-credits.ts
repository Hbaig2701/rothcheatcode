/**
 * Tax CREDITS — offset tax owed DOLLAR-FOR-DOLLAR.
 *
 * This is fundamentally different from a deduction (see getEffectiveDeduction):
 * a deduction reduces taxable INCOME (worth marginal-rate × amount); a credit
 * erases tax OWED, dollar-for-dollar.
 *
 * Modeled as a carryforward POOL. The advisor enters the TOTAL available credit
 * (e.g. a $300K disaster-relief carryover). Each year the engine draws the pool
 * down against that year's FEDERAL INCOME TAX, floors the tax at $0, and carries
 * the unused balance forward until the pool is exhausted.
 *
 * SCOPE (deliberate):
 *   • FEDERAL INCOME TAX ONLY. The credit does NOT offset the IRMAA surcharge,
 *     the 10% early-withdrawal penalty, or state income tax.
 *   • It does NOT change taxable income, AGI/MAGI, the marginal bracket, or the
 *     IRMAA tier. A conversion still pushes the client into the bracket and into
 *     IRMAA; the credit only pays the resulting federal income-tax bill. (This
 *     is exactly what makes it a credit and not a deduction.)
 *   • It does NOT resize the conversion. "Optimized" still fills to the same
 *     bracket ceiling — the credit makes that conversion cheaper, it doesn't
 *     enlarge it.
 *
 * Each scenario run (baseline AND strategy) starts with the FULL pool — the
 * credit exists in the client's tax situation regardless of strategy. The
 * strategy typically extracts more value because it front-loads the credit
 * against large conversion taxes before the pool can be wasted.
 *
 * Every engine guards on a positive pool so zero-credit clients (all existing
 * clients) hit byte-identical code paths.
 */

/**
 * Apply the carryforward credit pool to a COMPLETED YearlyResult[] as a single
 * post-pass — the canonical way the credit is applied across every engine.
 *
 * Why a post-pass instead of in-loop: the engines compute each year's balances
 * using the full (pre-credit) tax. Applying the credit afterward, against the
 * already-final federalTax, keeps it completely decoupled from each engine's
 * conversion solver, IRMAA-from-taxable deduction, and $0 balance floors — all
 * of which can silently absorb or distort an in-loop credit. Operating on the
 * final numbers makes the behavior identical across all engines and PROVABLY
 * conserving: because the internal balances are unchanged, net worth rises by
 * exactly the credit retained, at any growth rate.
 *
 * Per year: draw the pool against that year's FEDERAL income tax (floored at $0,
 * carried forward), scale the federal-tax display sub-components proportionally,
 * reduce totalTax by the same amount (state / IRMAA / penalty untouched), and
 * accumulate the saved dollars as a flat cash side-pocket added to taxableBalance
 * and netWorth. The side-pocket is non-growing — a credit preserves its face
 * value as retained cash; we don't assume a reinvestment return on it.
 *
 * No-op when the pool is <= 0, so zero-credit clients are byte-identical.
 *
 * Mutates the results in place AND returns them for convenience. Each scenario
 * (baseline and strategy) must call this with its OWN full pool — the credit
 * exists in the client's tax situation regardless of strategy.
 */
export function applyTaxCreditCarryforward<T extends {
  federalTax?: number; totalTax?: number; taxableBalance?: number; netWorth?: number;
  taxCreditApplied?: number; federalTaxOnConversions?: number; federalTaxOnSS?: number;
  federalTaxOnOrdinaryIncome?: number; federalTaxOnIRAWithdrawal?: number;
}>(results: T[], pool: number | null | undefined): T[] {
  let remaining = Math.max(0, pool ?? 0);
  if (remaining <= 0) return results;
  let creditCash = 0;
  for (const r of results) {
    const fed = Math.max(0, r.federalTax ?? 0);
    const applied = Math.min(remaining, fed);
    if (applied > 0) {
      remaining -= applied;
      const ratio = fed > 0 ? (fed - applied) / fed : 1;
      r.federalTax = fed - applied;
      r.totalTax = Math.max(0, (r.totalTax ?? 0) - applied);
      if (r.federalTaxOnConversions != null) r.federalTaxOnConversions = Math.round(r.federalTaxOnConversions * ratio);
      if (r.federalTaxOnSS != null) r.federalTaxOnSS = Math.round(r.federalTaxOnSS * ratio);
      if (r.federalTaxOnOrdinaryIncome != null) r.federalTaxOnOrdinaryIncome = Math.round(r.federalTaxOnOrdinaryIncome * ratio);
      if (r.federalTaxOnIRAWithdrawal != null) r.federalTaxOnIRAWithdrawal = Math.round(r.federalTaxOnIRAWithdrawal * ratio);
    }
    r.taxCreditApplied = applied;
    creditCash += applied;
    r.taxableBalance = (r.taxableBalance ?? 0) + creditCash;
    r.netWorth = (r.netWorth ?? 0) + creditCash;
  }
  return results;
}
