import type { Client } from '@/lib/types/client';
import type { YearlyResult } from '../types';
import { getAgeAtYearOffset } from '../utils/age';
import { getStateTaxRate } from '@/lib/data/states';

/**
 * Run the AUM (Assets Under Management) bucket simulation.
 *
 * Used by the split-allocation feature. The advisor's pitch is:
 *   "Convert X% of the client's IRA via Roth, send the remaining Y% to a
 *    managed brokerage account."
 * The Roth side keeps running on the existing engines. The AUM side runs
 * here, on its own slice of the IRA balance.
 *
 * What this models, in plain terms:
 *   1. The AUM portion has to come OUT of the IRA before it can land in the
 *      taxable brokerage. We pull it out across `aum_withdrawal_years` so the
 *      client doesn't get crushed by a single-year ordinary-income tax spike.
 *      Each pull adds to taxable income for the year (taxed at the client's
 *      max_tax_rate + state rate — a marginal estimate, intentionally simple).
 *   2. After tax, the cash lands in a brokerage. Each year we apply growth
 *      (rate_of_return), then deduct an AUM fee, then a tax drag for
 *      dividends/qualified income, then a tax drag for realized cap gains
 *      (modeled as a turnover percentage of unrealized gains).
 *   3. At end-of-projection, the report treats the residual balance as
 *      net legacy WITH a step-up in basis — heirs don't owe LTCG on the
 *      embedded gain. (Step-up is applied in the dashboard, not here.)
 *
 * Intentional v1 simplifications (worth knowing):
 *   - The AUM engine doesn't co-ordinate marginally with the Roth engine.
 *     Each engine sees the IRA withdrawal it makes; the SS-torpedo / IRMAA
 *     interactions across the two buckets aren't simulated. We use a flat
 *     marginal rate (max_tax_rate + state_tax_rate) for the IRA-to-AUM pull.
 *   - Dividend yield and turnover-realized gains are flat percentages with
 *     advisor-tunable defaults. No tax-lot tracking, no qualified-vs-ordinary
 *     dividend split.
 *   - AUM fees come out of the brokerage balance (NOT deductible post-TCJA).
 *
 * All monetary values are in cents.
 */
export interface AumScenarioInput {
  /** AUM portion of the IRA in cents. The full amount that needs to leave the IRA. */
  startingIraPortion: number;
  client: Client;
  startYear: number;
  projectionYears: number;
}

export function runAumScenario(input: AumScenarioInput): YearlyResult[] {
  const { client, startYear, projectionYears, startingIraPortion } = input;
  const results: YearlyResult[] = [];

  const clientAge = client.age && client.age > 0 ? client.age : 62;

  // Growth + AUM economics ----------------------------------------------------
  const growthRate = (client.rate_of_return ?? client.growth_rate ?? 7) / 100;
  const aumFeeRate = (client.aum_fee_percent ?? 1) / 100;
  const dividendYield = (client.aum_dividend_yield ?? 2) / 100;
  const turnoverRate = (client.aum_turnover_percent ?? 10) / 100;
  const withdrawalYears = Math.max(1, Math.min(projectionYears, client.aum_withdrawal_years ?? 5));

  // Tax rates -----------------------------------------------------------------
  // Marginal ordinary rate for the IRA-to-AUM pull. Flat for v1.
  const ordinaryMarginalDecimal = (client.max_tax_rate ?? 24) / 100;
  // LTCG rate for dividend + cap-gains drag.
  const ltcgDecimal = (client.ltcg_rate ?? 15) / 100;
  // State rate (additive on top of federal).
  const stateDecimal = client.state_tax_rate !== undefined && client.state_tax_rate !== null
    ? client.state_tax_rate / 100
    : getStateTaxRate(client.state);
  const ordinaryEffective = ordinaryMarginalDecimal + stateDecimal;
  const ltcgEffective = ltcgDecimal + stateDecimal;

  // Spouse age display gating mirrors the other engines.
  const isMarriedFiler = client.filing_status === 'married_filing_jointly'
    || client.filing_status === 'married_filing_separately';
  const initialSpouseAge = isMarriedFiler && client.spouse_age && client.spouse_age > 0
    ? client.spouse_age
    : null;

  // Per-year IRA-to-AUM pull. We compute it dynamically as
  // pendingIra / yearsRemaining each year — that smooths the tax burden
  // across the withdrawal period even though pendingIra is still growing
  // tax-deferred while waiting. A flat-amount schedule would sweep a huge
  // last-year balance and concentrate the bracket spike, which is exactly
  // what spreading the withdrawal is supposed to avoid.
  let pendingIra = startingIraPortion;          // Money still inside the IRA, waiting to transfer
  let aumBalance = 0;                            // Brokerage balance
  let aumCostBasis = 0;                          // For unrealized-gain math

  // Early-withdrawal penalty applies when the client is under 59½ at the
  // time of the IRA pull. Stacked on top of ordinary income tax.
  const earlyWithdrawalPenaltyRate = 0.10;

  for (let yearOffset = 0; yearOffset < projectionYears; yearOffset++) {
    const year = startYear + yearOffset;
    const age = getAgeAtYearOffset(clientAge, yearOffset);
    const currentSpouseAge = initialSpouseAge !== null ? initialSpouseAge + yearOffset : null;

    // BOY balances ------------------------------------------------------------
    const boyAum = aumBalance;
    const boyPendingIra = pendingIra;

    // 1) Pull from IRA into AUM (during withdrawal phase) ---------------------
    // Dynamic per-year pull: pendingIra / yearsRemaining. Last year naturally
    // sweeps any remainder (yearsRemaining = 1 → pull = pendingIra).
    let withdrawalGross = 0;
    let withdrawalTax = 0;
    let earlyWithdrawalPenalty = 0;
    if (yearOffset < withdrawalYears && pendingIra > 0) {
      const yearsRemaining = withdrawalYears - yearOffset;
      withdrawalGross = Math.round(pendingIra / yearsRemaining);
      // Defensive: if rounding produced something odd, never exceed pendingIra.
      if (withdrawalGross > pendingIra) withdrawalGross = pendingIra;
      withdrawalTax = Math.round(withdrawalGross * ordinaryEffective);
      // 10% early-withdrawal penalty when client is under 59½. Stacked on top
      // of income tax. Funded from the brokerage (i.e. it eats into the net
      // cash that would have landed in AUM).
      if (age < 60) {
        earlyWithdrawalPenalty = Math.round(withdrawalGross * earlyWithdrawalPenaltyRate);
      }
      const netCashIn = Math.max(0, withdrawalGross - withdrawalTax - earlyWithdrawalPenalty);
      pendingIra -= withdrawalGross;
      aumBalance += netCashIn;
      aumCostBasis += netCashIn;
    }

    // 2) Pendng IRA growth ----------------------------------------------------
    // The IRA portion not yet transferred earns the same growth rate while it
    // waits. Otherwise we'd be modeling money disappearing for years.
    const pendingIraGrowth = Math.round(pendingIra * growthRate);
    pendingIra += pendingIraGrowth;

    // 3) AUM brokerage growth -------------------------------------------------
    const aumGrowth = Math.round(aumBalance * growthRate);
    aumBalance += aumGrowth;

    // 4) AUM fee --------------------------------------------------------------
    const aumFee = Math.round(aumBalance * aumFeeRate);
    aumBalance -= aumFee;

    // 5) Dividend tax drag ----------------------------------------------------
    // Dividends are reinvested via DRIP — so the position's cost basis goes
    // up by the dividend amount (you "bought more shares" with the divs).
    // Without this bump, the unrealized-gain gap below would treat reinvested
    // dividends as price appreciation and double-tax them via turnover.
    const dividendIncome = Math.round(aumBalance * dividendYield);
    aumCostBasis += dividendIncome;
    const dividendTax = Math.round(dividendIncome * ltcgEffective);
    aumBalance -= dividendTax;

    // 6) Realized cap gains drag ----------------------------------------------
    let realizedTax = 0;
    if (aumBalance > aumCostBasis) {
      const unrealizedGain = aumBalance - aumCostBasis;
      const realizedThisYear = Math.round(unrealizedGain * turnoverRate);
      realizedTax = Math.round(realizedThisYear * ltcgEffective);
      aumBalance -= realizedTax;
      // The realized portion's basis steps up: those gains have been recognized
      // and taxed, so future turnover doesn't double-tax them.
      aumCostBasis += realizedThisYear;
    }
    // Defensive: balance should never drift below basis through fees alone.
    if (aumCostBasis > aumBalance) aumCostBasis = aumBalance;

    // Tax totals for this year ------------------------------------------------
    // Early-withdrawal penalty is a TAX in the IRS sense — surface it
    // alongside the income/cap-gains taxes so dashboards add it correctly.
    const totalTaxThisYear = withdrawalTax + dividendTax + realizedTax + earlyWithdrawalPenalty;

    // YearlyResult shape — fields not relevant to AUM stay 0/null so the
    // existing display layer can sum across the Roth bucket and AUM bucket
    // without surprises.
    results.push({
      year,
      age,
      spouseAge: currentSpouseAge,
      // Pending IRA shows as traditional balance until fully transferred.
      // After transfer completes, it stays at 0.
      traditionalBalance: pendingIra,
      rothBalance: 0,
      taxableBalance: aumBalance,
      rmdAmount: 0,
      conversionAmount: 0,
      ssIncome: 0,
      pensionIncome: 0,
      otherIncome: 0,
      totalIncome: withdrawalGross + dividendIncome,
      // Federal/state split is reported pro-rata against the ordinary vs LTCG
      // tax mix. Good enough for the column-level breakdown advisors care
      // about.
      federalTax: Math.round(
        withdrawalTax * (ordinaryMarginalDecimal / Math.max(ordinaryEffective, 1e-9)) +
        dividendTax * (ltcgDecimal / Math.max(ltcgEffective, 1e-9)) +
        realizedTax * (ltcgDecimal / Math.max(ltcgEffective, 1e-9))
      ),
      stateTax: Math.round(
        withdrawalTax * (stateDecimal / Math.max(ordinaryEffective, 1e-9)) +
        dividendTax * (stateDecimal / Math.max(ltcgEffective, 1e-9)) +
        realizedTax * (stateDecimal / Math.max(ltcgEffective, 1e-9))
      ),
      niitTax: 0,
      irmaaSurcharge: 0,
      totalTax: totalTaxThisYear,
      taxableSS: 0,
      netWorth: pendingIra + aumBalance,

      // Extended fields for the deep-dive table
      traditionalBOY: boyPendingIra,
      rothBOY: 0,
      taxableBOY: boyAum,
      traditionalGrowth: pendingIraGrowth,
      rothGrowth: 0,
      taxableGrowth: aumGrowth,
      iraWithdrawal: withdrawalGross,
      rothWithdrawal: 0,
      taxesPaidFromIRA: 0,
      earlyWithdrawalPenalty,
      // Tax breakdown — surface the AUM-specific buckets so advisors can
      // explain "this slice is the IRA pull, this slice is dividend drag."
      federalTaxOnConversions: 0,
      federalTaxOnOrdinaryIncome: Math.round(withdrawalTax * (ordinaryMarginalDecimal / Math.max(ordinaryEffective, 1e-9))),
      federalTaxOnSS: 0,
      stateTaxOnConversions: 0,
      stateTaxOnOrdinaryIncome: Math.round(withdrawalTax * (stateDecimal / Math.max(ordinaryEffective, 1e-9))),
      stateTaxOnSS: 0,
    });
  }

  return results;
}

/**
 * Convenience: roll up year-by-year AUM totals into headline metrics for the
 * dashboard / CSV / PDF.
 */
export function summarizeAumScenario(years: YearlyResult[]) {
  if (years.length === 0) {
    return {
      totalWithdrawnFromIra: 0,
      totalAumTaxPaid: 0,
      totalAumFees: 0,
      finalBalance: 0,
    };
  }
  let totalWithdrawnFromIra = 0;
  let totalAumTaxPaid = 0;
  for (const y of years) {
    totalWithdrawnFromIra += y.iraWithdrawal ?? 0;
    totalAumTaxPaid += y.totalTax;
  }
  const finalYear = years[years.length - 1];
  return {
    totalWithdrawnFromIra,
    totalAumTaxPaid,
    totalAumFees: 0, // tracked inline; advisors don't usually need a lifetime sum
    finalBalance: finalYear.taxableBalance,
  };
}
