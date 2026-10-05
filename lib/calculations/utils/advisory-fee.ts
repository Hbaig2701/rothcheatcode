import type { Client } from '@/lib/types/client';

/**
 * Advisory fee on managed assets — the fee an advisor charges for managing the
 * client's retirement money, charged on the ACCOUNT BALANCES rather than on a
 * carve-out bucket.
 *
 * WHY THIS EXISTS (separate from `aum_allocation_percent`)
 * --------------------------------------------------------
 * `aum_allocation_percent` is one control doing two unrelated jobs: it decides
 * what the advisor bills on AND what stays out of the conversion. Set it to
 * 100% and nothing converts at all, so an advisor whose actual pitch is
 * "convert the whole IRA to a Roth and I'll manage the Roth" had no way to
 * express it. Worse, the AUM bucket (`scenarios/aum.ts`) is economically
 * dominated: it pays full ordinary tax to land money in a TAXABLE brokerage,
 * where converting costs the identical tax and lands it in a Roth with no
 * ongoing drag and no RMDs. Measured on a $2M IRA to age 95, routing 40% to
 * the managed brokerage cost $1,437,191 of net legacy.
 *
 * This fee is the honest way to model the same business: the conversion runs
 * normally and the fee rides on whatever accounts the money is sitting in.
 *
 * BASELINE SYMMETRY — the part that decides whether the comparison is honest
 * -------------------------------------------------------------------------
 * The fee defaults to applying on BOTH sides (`advisory_fee_in_baseline`,
 * default true). An advisor who manages the money after a conversion would
 * also have managed it if the client did nothing — the dollars are the same
 * dollars, only the wrapper changes. Charging a fee-paying Roth against a
 * fee-free do-nothing IRA would invent a ~1%/yr penalty the baseline never
 * pays, compounding badly over 30 years and understating the conversion. The
 * switch exists for the genuine exception (the money would sit at a different
 * custodian untouched if they don't convert), not as the default.
 *
 * With the fee on both sides the conversion still wins for the original
 * reason — same tax in, no ongoing drag — the fee simply stops distorting it.
 *
 * SCOPE: all three buckets (Traditional + Roth + taxable), both sides. Charging
 * on everything is what makes the two sides symmetric at ANY conversion
 * percentage: a partial conversion moves dollars between buckets that are all
 * billed at the same rate, so the fee can't bias the comparison. A
 * bill-only-on-the-converted-money variant would need the baseline to know the
 * strategy's conversion schedule to stay symmetric — see WISHLIST.
 *
 * TAX TREATMENT: none. Investment-advisory fees have not been deductible since
 * TCJA, and a fee paid directly from an IRA/Roth out of its own assets is not a
 * taxable distribution. So the fee reduces balances and nothing else — it never
 * touches taxable income, MAGI, IRMAA or the bracket math. (It does lower next
 * year's RMD base, automatically, because RMDs are computed off the prior
 * year-end balance.)
 *
 * ENGINE COVERAGE: growth (`scenarios/growth-formula.ts`), standard
 * (`scenarios/formula.ts`) and the shared baseline (`scenarios/baseline.ts`).
 * The guaranteed-income engine carries its OWN baseline
 * (`guaranteed-income/engine.ts`) and is deliberately excluded — a fee is a
 * no-op on both its sides, which keeps it symmetric rather than half-applied.
 * The client form hides the field for GI products so it can't be set silently.
 *
 * All monetary values are in CENTS.
 */

/** Default for `advisory_fee_in_baseline` when the column is null. */
export const ADVISORY_FEE_IN_BASELINE_DEFAULT = true;

/**
 * The fee rate to apply on one side of the comparison, as a decimal
 * (1.0% -> 0.01). Returns 0 when the feature is off for that side, so every
 * call site can early-out and stay byte-identical for existing clients.
 */
export function getAdvisoryFeeRate(client: Client, side: 'strategy' | 'baseline'): number {
  const percent = client.advisory_fee_percent ?? 0;
  if (!(percent > 0)) return 0;
  if (side === 'baseline' && (client.advisory_fee_in_baseline ?? ADVISORY_FEE_IN_BASELINE_DEFAULT) === false) {
    return 0;
  }
  return percent / 100;
}

/**
 * Fee dollars on one bucket. Never negative, never more than the balance —
 * a fee can draw an account down to zero but not overdraw it.
 */
export function advisoryFeeOn(balance: number, rate: number): number {
  if (rate <= 0 || !(balance > 0)) return 0;
  return Math.min(balance, Math.round(balance * rate));
}

export interface AdvisoryFeeCharge {
  traditional: number;
  roth: number;
  taxable: number;
  /** traditional + roth + taxable — what the row's `advisoryFee` reports. */
  total: number;
}

/**
 * Fee dollars on each bucket for one year. The caller subtracts them from its
 * own running balances (the engines all track those differently, so this
 * returns the charge rather than mutating anything).
 */
export function advisoryFeeCharge(
  rate: number,
  balances: { traditional: number; roth: number; taxable: number }
): AdvisoryFeeCharge {
  const traditional = advisoryFeeOn(balances.traditional, rate);
  const roth = advisoryFeeOn(balances.roth, rate);
  const taxable = advisoryFeeOn(balances.taxable, rate);
  return { traditional, roth, taxable, total: traditional + roth + taxable };
}
