import type { Client, NonSSIIncomeEntry } from '@/lib/types/client';
import type { SimulationResult, YearlyResult, FilingStatus } from '@/lib/calculations/types';
import { calculateRMD } from '@/lib/calculations/modules/rmd';
import { calculateConversionFederalTax } from '@/lib/calculations/modules/federal-tax';
import { getBirthYear, getBirthYearFromAge, getAgeAtYearOffset } from '@/lib/calculations/utils/age';
import { getNonSSIIncomeForYear, getTaxExemptIncomeForYear } from '@/lib/calculations/utils/income';

/**
 * Held-back Traditional IRA — income-only overlay.
 *
 * When the advisor marks RMDs as handled externally AND enters a held-back IRA
 * balance (money kept as a plain Traditional IRA outside this annuity, e.g. at
 * Fidelity), we auto-compute that IRA's RMD each year — growing and DEPLETING
 * the balance so the RMD amount is correct year to year — and fold it into the
 * client's non-SSI ordinary income for BOTH the baseline and the strategy. That
 * makes the Roth conversion get taxed on TOP of the real RMD income (correct
 * marginal brackets, SS-torpedo, IRMAA) instead of in a vacuum, via the existing
 * Other-Income → conversion-bracket path — no engine change needed.
 *
 * This is the income-only tier: the held-back balance's own wealth and heir tax
 * are intentionally NOT added to the net-worth totals (they're identical on both
 * sides, so they wash out of the "Additional Lifetime Wealth" delta). Returns the
 * client unchanged when the feature is off, so existing cases are byte-identical.
 *
 * The held-back IRA is where the client takes their RMDs ("externally"), which is
 * why the UI reveals this field under the "RMDs Handled Externally" toggle. But
 * that toggle by itself ZEROES RMDs on the modeled (converting) slice for BOTH
 * sides — which is wrong for the do-nothing baseline, where that slice is still a
 * plain Traditional IRA that WOULD take RMDs (verified $556K too low on a
 * $3M/$1.5M case; the real "Bill Schlip" scenario showed a $0 RMD column). So
 * when a held-back balance is present we OVERRIDE `rmds_handled_externally` back
 * to false — keeping the converting slice's own RMDs (do-nothing has them, the
 * conversion removes them) — and let this overlay add the held-back account's
 * RMDs on top. Net: do-nothing RMDs on the full balance, strategy RMDs on just
 * the held-back amount. The plain toggle (no held-back balance) is unchanged.
 */
/**
 * The held-back IRA's per-year RMD schedule (year -> RMD in cents). Grows +
 * RMD-depletes the balance so each year's RMD is correct. Empty map when the
 * feature is off. Exposed so the route can also surface these as a display-only
 * "RMD (External)" column on the year-by-year rows.
 */
export function computeHeldBackRmdSchedule(client: Client): Map<number, number> {
  const startBalance = client.held_back_ira_balance ?? 0;
  const rmdByYear = new Map<number, number>();
  if (startBalance <= 0) return rmdByYear;

  const currentYear = new Date().getFullYear();
  const clientAge = client.age && client.age > 0 ? client.age : 62;
  const projectionYears = client.age && client.end_age
    ? client.end_age - client.age
    : (client.projection_years ?? 30);
  // Derive birthYear the SAME way the engines do (baseline.ts): prefer AGE when
  // present (age-based clients), falling back to DOB. Deriving from DOB first — while
  // the divisor age comes from client.age — could start the held-back RMDs a year off
  // from the modeled slice when age and DOB straddle the 1959/1960 SECURE-2.0 line
  // (RMD start 73 vs 75).
  const birthYear = client.age && client.age > 0
    ? getBirthYearFromAge(clientAge, currentYear)
    : (client.date_of_birth ? getBirthYear(client.date_of_birth) : getBirthYearFromAge(clientAge, currentYear));
  // The held-back IRA is a plain "do-nothing" Traditional IRA held elsewhere, so
  // absent an explicit override it grows at the SAME rate the baseline models its own
  // Traditional IRA (baseline_comparison_rate) — NOT the annuity's rate_of_return. An
  // explicit held_back_ira_growth_rate governs the IRA ITSELF; note the residual's
  // reinvestment side-account (applyHeldBackResidualToStrategy) always grows at
  // baseline_comparison_rate, since those after-tax RMD proceeds sit in a taxable
  // brokerage (a different account) — so the two rates intentionally diverge only when
  // the override is set. When it's unset, both equal baseline_comparison_rate.
  const growthRate = ((client.held_back_ira_growth_rate ?? client.baseline_comparison_rate ?? client.rate_of_return ?? 0)) / 100;

  // Grow + RMD-deplete the held-back balance year by year. RMD is taken on the
  // beginning-of-year balance (calculateRMD returns 0 before the client's SECURE
  // 2.0 start age), then the remainder grows — mirroring the engines' order.
  let balance = startBalance;
  for (let offset = 0; offset < projectionYears; offset++) {
    const age = getAgeAtYearOffset(clientAge, offset);
    const { rmdAmount } = calculateRMD({ age, traditionalBalance: balance, birthYear });
    if (rmdAmount > 0) {
      rmdByYear.set(currentYear + offset, rmdAmount);
      balance -= rmdAmount;
    }
    balance += Math.round(balance * growthRate);
  }
  return rmdByYear;
}

export function applyHeldBackIraRmd(client: Client): Client {
  const startBalance = client.held_back_ira_balance ?? 0;
  if (startBalance <= 0) return client;

  const currentYear = new Date().getFullYear();
  const clientAge = client.age && client.age > 0 ? client.age : 62;
  const projectionYears = client.age && client.end_age
    ? client.end_age - client.age
    : (client.projection_years ?? 30);

  const rmdByYear = computeHeldBackRmdSchedule(client);
  if (rmdByYear.size === 0) return client;

  // Merge into a full per-year non-SSI income table, preserving the client's
  // existing income (flat field OR table — getNonSSIIncomeForYear handles both)
  // and adding the held-back RMD on top. Building the table folds in the flat
  // field so nothing is dropped (the table takes priority over the flat field).
  const merged: NonSSIIncomeEntry[] = [];
  for (let offset = 0; offset < projectionYears; offset++) {
    const year = currentYear + offset;
    const rmd = rmdByYear.get(year) ?? 0;
    const existingGross = getNonSSIIncomeForYear(client, year);
    const existingExempt = getTaxExemptIncomeForYear(client, year);
    if (existingGross === 0 && existingExempt === 0 && rmd === 0) continue;
    merged.push({
      year,
      age: getAgeAtYearOffset(clientAge, offset),
      gross_taxable: existingGross + rmd,
      tax_exempt: existingExempt,
    });
  }
  // Table now carries everything; clear the flat fields so they aren't summed
  // twice (they wouldn't be — table wins — but keep it unambiguous). Also
  // override rmds_handled_externally back to false so the converting slice keeps
  // modeling its own RMDs (see the header comment) — the held-back overlay is
  // now what represents the external RMDs.
  return {
    ...client,
    non_ssi_income: merged,
    gross_taxable_non_ssi: 0,
    tax_exempt_non_ssi: 0,
    rmds_handled_externally: false,
  };
}

/**
 * The after-tax value of one year's held-back RMD on a given side.
 *
 * The held-back RMD is the client's mandatory ordinary income, so it's taxed at that
 * side's MARGINAL rate — NOT the average. That distinction is the whole point of the
 * residual: the two sides differ in marginal rate (the do-nothing side is shoved into
 * a higher bracket by its own slice RMDs; the strategy sits lower once the slice is
 * Roth), and average-rate attribution would badly over-state the gap (the baseline
 * average is dragged up by slice RMDs that have nothing to do with the held-back RMD's
 * marginal position).
 *
 * We compute the true marginal federal tax with the engine's own conversion-tax helper
 * (tax_with − tax_without), stacking the held-back RMD at its FLOOR position: the base
 * is the year's taxable income MINUS the conversion MINUS the held-back RMD, so the
 * discretionary conversion correctly sits ABOVE the mandatory RMD (matching the engine's
 * stacking) instead of inflating its rate in conversion/RMD overlap years. State is the
 * flat marginal rate. Inherits the engine's inflation-indexed brackets and filing status.
 */
function afterTaxHeldBackRmd(
  row: YearlyResult | undefined,
  rmd: number,
  filingStatus: FilingStatus,
  stateRate: number,
): number {
  if (!row || rmd <= 0) return 0;
  const base = Math.max(0, (row.taxableIncome ?? 0) - (row.conversionAmount ?? 0) - rmd);
  const marginalFed = calculateConversionFederalTax(rmd, base, filingStatus, row.year);
  const marginalState = Math.round(rmd * stateRate);
  return rmd - marginalFed - marginalState;
}

/**
 * Held-back Traditional IRA — RESIDUAL overlay (tier 2, strategy side only).
 *
 * The income-only overlay (applyHeldBackIraRmd) taxes the held-back RMDs in the
 * correct brackets on both sides but banks their after-tax proceeds nowhere — so
 * the held-back IRA is a pure wash in the delta. That wash is EXACT for every
 * component EXCEPT one: the held-back RMDs are taxed at a different marginal rate
 * on each side (do-nothing is shoved into a high bracket by its own slice RMDs;
 * the strategy sits lower once the slice is Roth), so the strategy keeps more of
 * each RMD after tax. Reinvested and grown, that difference is a REAL advantage of
 * converting — and it's the only part of the held-back IRA that doesn't cancel.
 *
 * This function models exactly that residual and nothing else: it grows two
 * identical held-back reinvestment side-accounts (one per side) that differ ONLY
 * in the tax on the RMD, and folds the running difference (strategy − baseline)
 * into each strategy year's netWorth + taxableBalance. The held-back balance,
 * terminal value, and heir tax are identical on both sides and stay OUT of the
 * totals (so the % denominator isn't inflated — see the residual-only decision).
 *
 * No-op when there's no held-back balance, or when rmd_treatment is 'spent' (spent
 * proceeds don't accumulate as legacy, matching how the engines treat spent slice
 * RMDs). Mutates result.formula in place. `client` is the RAW client (pre-overlay).
 */
export function applyHeldBackResidualToStrategy(client: Client, result: SimulationResult): void {
  const startBalance = client.held_back_ira_balance ?? 0;
  if (startBalance <= 0) return;
  const rmdTreatment = client.rmd_treatment ?? 'reinvested';
  if (rmdTreatment === 'spent') return;

  const rmdByYear = computeHeldBackRmdSchedule(client);
  if (rmdByYear.size === 0) return;

  const growthRate = ((client.baseline_comparison_rate ?? client.rate_of_return ?? 0)) / 100;
  const stateRate = (client.state_tax_rate ?? 0) / 100;
  const filingStatus = (client.filing_status ?? 'single') as FilingStatus;
  const baselineByYear = new Map(result.baseline.map((y) => [y.year, y]));

  // Two side-accounts (baseline vs strategy) reinvesting the held-back IRA's
  // after-tax RMDs. Identical mechanics; the ONLY difference is the per-side tax
  // on the RMD. 'reinvested' grows at the comparison rate; 'cash' accumulates flat
  // (mirrors baseline.ts). Grow the beginning-of-year balance first, then add this
  // year's after-tax proceeds — same order as the engines.
  let baselineAcct = 0;
  let strategyAcct = 0;
  for (const fy of result.formula) {
    const rmd = rmdByYear.get(fy.year) ?? 0;
    if (rmdTreatment === 'reinvested') {
      baselineAcct += Math.round(baselineAcct * growthRate);
      strategyAcct += Math.round(strategyAcct * growthRate);
    }
    baselineAcct += afterTaxHeldBackRmd(baselineByYear.get(fy.year), rmd, filingStatus, stateRate);
    strategyAcct += afterTaxHeldBackRmd(fy, rmd, filingStatus, stateRate);

    // The residual can be NEGATIVE: e.g. a Growth FIA whose premium bonus inflates
    // the strategy's slice RMDs pushes the held-back RMDs into a higher bracket on the
    // strategy than on the do-nothing baseline, so the strategy keeps LESS of them —
    // a real (if small) cost. Floor taxableBalance at $0 when applying it (matching the
    // engines' v53 taxable floor) and move netWorth by the SAME floored delta so the
    // traditional+roth+taxable === netWorth invariant is preserved. heldBackResidual
    // records the raw (possibly negative) figure for the breakout column.
    const residual = strategyAcct - baselineAcct;
    const newTaxable = Math.max(0, fy.taxableBalance + residual);
    const appliedDelta = newTaxable - fy.taxableBalance;
    fy.taxableBalance = newTaxable;
    fy.netWorth += appliedDelta;
    fy.heldBackResidual = residual;
  }
}

/**
 * Lifetime marginal income tax on the held-back IRA's RMDs for a given set of year
 * rows (baseline or strategy). Uses the same floor-position marginal method as the
 * residual. Used by the dashboard so the "tax attributable to RMDs" narrative covers
 * the held-back external RMDs too — otherwise it pairs an all-RMDs figure (slice +
 * external) with a slice-only tax. 0 when there's no held-back balance.
 */
export function computeHeldBackRmdMarginalTax(client: Client, years: YearlyResult[]): number {
  const startBalance = client.held_back_ira_balance ?? 0;
  if (startBalance <= 0) return 0;
  const rmdByYear = computeHeldBackRmdSchedule(client);
  if (rmdByYear.size === 0) return 0;
  const stateRate = (client.state_tax_rate ?? 0) / 100;
  const filingStatus = (client.filing_status ?? 'single') as FilingStatus;
  let total = 0;
  for (const y of years) {
    const rmd = rmdByYear.get(y.year) ?? 0;
    if (rmd <= 0) continue;
    total += rmd - afterTaxHeldBackRmd(y, rmd, filingStatus, stateRate);
  }
  return total;
}
