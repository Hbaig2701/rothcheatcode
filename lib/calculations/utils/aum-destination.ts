import type { Client } from '@/lib/types/client';
import { isGuaranteedIncomeProduct, type FormulaType } from '@/lib/config/products';

/**
 * Where the AUM-allocated slice of the IRA actually goes.
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * "AUM Allocation" reads like "the part I manage", but mechanically it was a
 * different STRATEGY: `scenarios/aum.ts` pulls the slice OUT of the IRA at
 * ordinary rates into a TAXABLE brokerage, then charges a fee plus a dividend
 * drag plus a turnover drag every year after. Nothing converts — set it to 100%
 * and the report correctly reads "No Roth conversion this scenario", which is
 * not at all what an advisor saying "move it to AUM" means.
 *
 * What they mean is: the money IS Roth converted, and the advisory account is
 * simply where the converted money is managed instead of an annuity. Same
 * ordinary tax at the moment of conversion — but it lands somewhere with no
 * ongoing tax drag and no RMDs. Measured on a $2M IRA, MFJ, 6%, to age 95, 1%
 * fee on both sides: the Roth destination produced $7,884,945 of net legacy vs
 * $6,805,079 routing the same money to the taxable brokerage — a difference of
 * $1,079,866, and the heirs receive a Roth rather than a taxable account.
 *
 * HOW 'roth' IS MODELLED
 * ----------------------
 * The IRA is NOT split. The whole balance runs through the normal conversion
 * engine, so the conversion stays bracket- and IRMAA-aware (the taxable AUM
 * bucket taxes its pulls at a flat marginal rate instead, which is fine for a
 * brokerage transfer but wrong for a conversion). `aum_allocation_percent` then
 * becomes the share of each year's CONVERSION that lands in a managed Roth
 * sleeve growing at `aum_growth_rate`; the remainder grows at the annuity/Roth
 * rate as before. The advisory fee (`advisory_fee_percent`) rides on the whole
 * Roth balance either way — it is a separate control and stays separate.
 *
 * Because the slice is a share of conversions rather than a carve-out of the
 * starting balance, the strategy and the do-nothing baseline both start from the
 * same IRA, so the comparison needs no special handling.
 *
 * GI PRODUCTS ALWAYS BEHAVE AS 'taxable'. The guaranteed-income engine has its
 * own Roth/income machinery and no managed sleeve, so honouring the destination
 * there would be half-applied — worse than not honouring it. The exclusion lives
 * in `aumSliceGoesToRoth` rather than at the call sites so it cannot be missed,
 * and the client form hides the option for GI so it can't be set silently.
 */

/**
 * True when the allocated slice should be Roth CONVERTED and managed, rather
 * than pulled into a taxable brokerage. False for GI products, for a 0%
 * allocation, and for every existing client (the column reads null).
 */
export function aumSliceGoesToRoth(client: Client): boolean {
  if ((client.aum_allocation_percent ?? 0) <= 0) return false;
  if (client.aum_destination !== 'roth') return false;
  if (isGuaranteedIncomeProduct(client.blueprint_type as FormulaType)) return false;
  return true;
}

/**
 * True when the original taxable-brokerage split applies — i.e. the route must
 * carve the IRA (`buildRothSideClient`), run `runAumScenario`, fold the pull
 * into the Roth side's MAGI, and give the baseline its own full-IRA run.
 *
 * Every call site that used to test `aum_allocation_percent > 0` for that
 * purpose must test THIS instead, or a Roth-destination client would get both
 * treatments: the IRA carved away AND the conversion share applied.
 */
export function aumSliceGoesToTaxableBrokerage(client: Client): boolean {
  return (client.aum_allocation_percent ?? 0) > 0 && !aumSliceGoesToRoth(client);
}

/**
 * Share of each year's conversion that lands in the managed Roth sleeve, as a
 * decimal (40% -> 0.4). 0 whenever the Roth destination isn't active, so the
 * engines stay byte-identical for everyone else.
 */
export function managedRothShare(client: Client): number {
  return aumSliceGoesToRoth(client) ? (client.aum_allocation_percent ?? 0) / 100 : 0;
}

/**
 * Annual growth rate for the managed Roth sleeve, as a decimal. Falls back to
 * the client's main rate when `aum_growth_rate` is unset, so turning the
 * destination on without touching the rate changes nothing but the label.
 */
export function managedRothGrowthRate(client: Client): number {
  return (client.aum_growth_rate ?? client.rate_of_return ?? client.growth_rate ?? 7) / 100;
}
