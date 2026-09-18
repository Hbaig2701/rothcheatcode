import type { Client } from '@/lib/types/client';
import type { YearlyResult, FilingStatus } from '@/lib/calculations/types';
import { getAgeAtYearOffset } from '@/lib/calculations/utils/age';
import { mergeIncomeScheduleIntoClient, projectionYearsFor } from '@/lib/calculations/utils/income';
import { afterTaxHeldBackRmd } from '@/lib/calculations/utils/held-back-ira';
import { QLAC_DEFAULT_INCOME_START_AGE } from '@/lib/data/qlac-limits';

/**
 * QLAC — Qualified Longevity Annuity Contract.
 *
 * A QLAC is a deferred income annuity bought INSIDE the IRA with up to the IRS
 * premium cap ($210,000 per person for 2026 — IRC §401(a)(9)(A)/SECURE 2.0 §202,
 * indexed in $10K steps). Tax mechanics we model:
 *
 *   1. The premium is EXCLUDED from the Dec-31 IRA balance the RMD divisor is
 *      applied to, so RMDs on the remaining IRA drop from the first RMD year.
 *      Once payments start they satisfy the QLAC's own RMD, so the exclusion is
 *      permanent — the remaining IRA never re-absorbs the premium.
 *   2. Income must begin no later than the month after the 85th birthday.
 *      Every payout is ordinary income (brackets, SS torpedo, IRMAA MAGI).
 *   3. No cash value, no surrender, no Roth conversion of the annuitized slice.
 *   4. Death benefit is either return of premium (heirs get premium − income
 *      already paid, taxed as IRD at the heir rate) or nothing (life-only).
 *
 * Implementation mirrors the held-back IRA overlay (utils/held-back-ira.ts):
 *
 *   - applyQlacToClient (pre-sim): carve the premium out of
 *     qualified_account_value — so the engines' boyIRA (the RMD base AND the
 *     conversion cap) is already net of it and the FIA premium bonus is never
 *     credited on it — and fold the payout schedule into the non-SSI income
 *     table so the existing Other-Income → tax path prices it in the correct
 *     brackets on the same footing as a pension. Zero engine edits.
 *   - applyQlacOverlay (post-sim): stamp the per-year breakout fields and bank
 *     the after-tax payouts per rmd_treatment (the QLAC income IS that slice's
 *     forced distribution, so it follows the same spent/cash/reinvested rule as
 *     RMDs) plus the return-of-premium death benefit into netWorth. Without this
 *     the strategy would be docked the full premium for buying the contract.
 *
 * Strategy-side only by default: the do-nothing baseline keeps the whole IRA
 * (same convention as the AUM split). qlac_in_baseline applies the same
 * carve-out + overlay to the baseline for a client who already owns the QLAC,
 * so the comparison then isolates the Roth conversion.
 *
 * Purchase is modeled at the start of the projection (year 1). A purchase in a
 * later year is not supported yet.
 */

export { QLAC_PREMIUM_LIMIT_CENTS, QLAC_MAX_INCOME_START_AGE, QLAC_DEFAULT_INCOME_START_AGE } from '@/lib/data/qlac-limits';

export function isQlacActive(client: Client): boolean {
  return (client.qlac_premium ?? 0) > 0 && (client.qualified_account_value ?? 0) > 0;
}

/** Premium actually carved out: the entered premium, capped at the IRA balance. */
export function getQlacPremium(client: Client): number {
  if (!isQlacActive(client)) return 0;
  return Math.min(client.qlac_premium ?? 0, client.qualified_account_value ?? 0);
}

export function getQlacIncomeStartAge(client: Client): number {
  return client.qlac_income_start_age ?? QLAC_DEFAULT_INCOME_START_AGE;
}

export function hasQlacReturnOfPremium(client: Client): boolean {
  return (client.qlac_death_benefit ?? 'return_of_premium') === 'return_of_premium';
}

/**
 * Gross QLAC income by calendar year: the quoted annual amount every year from
 * the income start age through the end of the projection. Level payout only —
 * the first year is counted in full (illustrations quote the annual figure
 * from the start date; we don't pro-rate the start month). Empty when off.
 */
export function computeQlacPayoutSchedule(client: Client): Map<number, number> {
  const schedule = new Map<number, number>();
  if (!isQlacActive(client)) return schedule;
  const income = client.qlac_annual_income ?? 0;
  if (income <= 0) return schedule;

  const currentYear = new Date().getFullYear();
  const clientAge = client.age && client.age > 0 ? client.age : 62;
  const startAge = getQlacIncomeStartAge(client);
  const projectionYears = projectionYearsFor(client);
  for (let offset = 0; offset < projectionYears; offset++) {
    if (getAgeAtYearOffset(clientAge, offset) >= startAge) {
      schedule.set(currentYear + offset, income);
    }
  }
  return schedule;
}

/**
 * Pre-sim transform: carve the premium out of the IRA and fold the payout
 * schedule into the non-SSI income table (same merge as applyHeldBackIraRmd —
 * the table already carries any held-back RMDs by the time this runs, and
 * getNonSSIIncomeForYear sums every row for a year, so nothing is dropped).
 * Returns the client unchanged when the feature is off.
 */
export function applyQlacToClient(client: Client): Client {
  const premium = getQlacPremium(client);
  if (premium <= 0) return client;
  return {
    ...mergeIncomeScheduleIntoClient(client, computeQlacPayoutSchedule(client)),
    qualified_account_value: (client.qualified_account_value ?? 0) - premium,
  };
}

/**
 * Which client each side of the comparison runs on. Strategy always holds the
 * QLAC; the do-nothing baseline only when the client already owns it
 * (qlac_in_baseline). `qlacStrategyOnly` tells the caller the two sides start
 * from different IRAs and the baseline must be simulated on its own inputs.
 * Pass the client AFTER any held-back-IRA overlay so both income streams land
 * in the same non-SSI table. Both routes (projections, analysis) use this.
 */
export function resolveQlacSides(client: Client): { baselineClient: Client; strategyClient: Client; qlacStrategyOnly: boolean } {
  const qlacStrategyOnly = isQlacActive(client) && !client.qlac_in_baseline;
  const strategyClient = applyQlacToClient(client);
  return { baselineClient: qlacStrategyOnly ? client : strategyClient, strategyClient, qlacStrategyOnly };
}

/**
 * Post-sim overlay for a full simulation result: strategy rows always, baseline
 * rows only when the client holds the QLAC on both sides, plus the heirBenefit
 * delta (the unrecovered premium is inherited pre-tax like a Traditional
 * balance, so the side holding it owes heir tax on it). Applied as a DELTA on
 * top of each engine's own figure — the GI engine deliberately taxes its
 * Roth-annuity strategy side at $0 (that value is mapped into
 * traditionalBalance), so recomputing from balances would be wrong there.
 * No-op without a QLAC. `client` is the RAW client (pre-carve-out).
 */
export function applyQlacToResult(client: Client, result: { baseline: YearlyResult[]; formula: YearlyResult[]; heirBenefit: number }): void {
  if (!isQlacActive(client)) return;
  applyQlacOverlay(client, result.formula);
  if (client.qlac_in_baseline) applyQlacOverlay(client, result.baseline);
  const heirRate = (client.heir_tax_rate ?? 40) / 100;
  const baselineQlacHeirTax = Math.round(finalQlacDeathBenefit(result.baseline) * heirRate);
  const strategyQlacHeirTax = Math.round(finalQlacDeathBenefit(result.formula) * heirRate);
  result.heirBenefit += baselineQlacHeirTax - strategyQlacHeirTax;
}

/**
 * Post-sim overlay on one side's year rows. Mutates in place:
 *
 *   qlacPayout        — this year's gross payout (breakout; already in otherIncome)
 *   qlacDeathBenefit  — EOY return-of-premium value (premium − cumulative payouts)
 *   qlacReinvested    — running after-tax payout bank per rmd_treatment
 *   taxableBalance   += qlacReinvested
 *   netWorth         += qlacReinvested + qlacDeathBenefit
 *   cumulativeDistributions += after-tax payouts to date when rmd_treatment is
 *                       'spent' (so the spent-view lifetime figure counts them)
 *
 * The after-tax payout uses the same floor-position marginal method as the
 * held-back RMD residual: the payout is mandatory ordinary income stacked
 * BELOW any conversion, taxed with the engine's own inflation-indexed brackets
 * for that row's year + filing status; state at the flat rate. `client` is the
 * RAW client (pre-transform) so the premium/treatment are the advisor's inputs.
 */
export function applyQlacOverlay(client: Client, years: YearlyResult[]): void {
  const premium = getQlacPremium(client);
  if (premium <= 0) return;

  const payouts = computeQlacPayoutSchedule(client);
  const rop = hasQlacReturnOfPremium(client);
  const rmdTreatment = client.rmd_treatment ?? 'reinvested';
  // Same brokerage rate the held-back residual side-account grows at — the
  // banked payouts sit in the taxable account, not the annuity.
  const growthRate = ((client.baseline_comparison_rate ?? client.rate_of_return ?? 0)) / 100;
  const stateRate = (client.state_tax_rate ?? 0) / 100;
  const filingStatus = (client.filing_status ?? 'single') as FilingStatus;

  let cumulativePayouts = 0;
  let cumulativeAfterTax = 0;
  let bank = 0;
  for (const y of years) {
    const payout = payouts.get(y.year) ?? 0;
    cumulativePayouts += payout;
    const afterTax = afterTaxHeldBackRmd(y, payout, filingStatus, stateRate);
    cumulativeAfterTax += afterTax;

    if (rmdTreatment === 'reinvested') bank += Math.round(bank * growthRate);
    if (rmdTreatment !== 'spent') bank += afterTax;

    const deathBenefit = rop ? Math.max(0, premium - cumulativePayouts) : 0;

    y.qlacPayout = payout;
    y.qlacDeathBenefit = deathBenefit;
    y.qlacReinvested = bank;
    y.taxableBalance += bank;
    y.netWorth += bank + deathBenefit;
    if (rmdTreatment === 'spent' && cumulativeAfterTax > 0) {
      y.cumulativeDistributions = (y.cumulativeDistributions ?? 0) + cumulativeAfterTax;
    }
  }
}

/**
 * The QLAC's heir-taxable value at the end of a side's projection (its
 * return-of-premium balance in the final row). Every "heir tax = final
 * Traditional × heir rate" surface must add this, since the unrecovered
 * premium is inherited pre-tax exactly like a Traditional IRA.
 */
export function finalQlacDeathBenefit(years: YearlyResult[] | null | undefined): number {
  if (!years || years.length === 0) return 0;
  return years[years.length - 1]?.qlacDeathBenefit ?? 0;
}
