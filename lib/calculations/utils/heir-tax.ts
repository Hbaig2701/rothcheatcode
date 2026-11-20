/**
 * Heir income tax on an inherited Traditional IRA, net of after-tax basis.
 *
 * Heirs pay ordinary income tax on an inherited Traditional IRA EXCEPT on the
 * owner's remaining after-tax basis (Form 8606) — that part was already taxed
 * and passes to them tax-free (the beneficiary inherits the basis). Every
 * heir-tax site therefore taxes `traditional − remaining basis`, never the full
 * balance.
 *
 * The engines stamp `iraBasisRemaining` on every year row (growth engine +
 * baseline; GI rows have none), so the final basis is the last row's value.
 *
 * With no basis (>99% of clients) every helper returns the balance unchanged,
 * so the arithmetic at each call site stays byte-identical.
 *
 * All amounts in cents.
 */

type BasisRow = { iraBasisRemaining?: number | null };

/** Remaining after-tax IRA basis at the end of a projection (0 when none). */
export function finalIraBasis(years: ReadonlyArray<BasisRow> | null | undefined): number {
  if (!years || years.length === 0) return 0;
  return Math.max(0, years[years.length - 1]?.iraBasisRemaining ?? 0);
}

/** The part of a Traditional balance that is after-tax basis (heirs owe no tax on it). */
export function iraBasisShare(traditional: number, basis: number | null | undefined): number {
  return Math.min(Math.max(0, basis ?? 0), Math.max(0, traditional));
}

/** The part of a Traditional balance heirs pay income tax on. */
export function heirTaxableIra(traditional: number, basis: number | null | undefined): number {
  return traditional - iraBasisShare(traditional, basis);
}
