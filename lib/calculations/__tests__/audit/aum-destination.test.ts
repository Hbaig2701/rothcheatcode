/**
 * AUM destination — value verification (v83).
 *
 * Run: npx tsx lib/calculations/__tests__/audit/aum-destination.test.ts
 *
 * `aum_allocation_percent` used to mean one thing only: pull the slice OUT of
 * the IRA at ordinary rates into a TAXABLE brokerage. Nothing converted — at
 * 100% the report read "No Roth conversion this scenario", which is not what an
 * advisor saying "move it to AUM" means. `aum_destination = 'roth'` makes the
 * slice Roth CONVERTED and managed in a Roth sleeve at `aum_growth_rate`.
 *
 * What is locked here:
 *  1. Default/null is byte-identical to explicit 'taxable' — no live client moves.
 *  2. The Roth destination actually CONVERTS; the taxable one still does not.
 *  3. The IRA is NOT carved under 'roth' (the conversion stays bracket-aware),
 *     and no second engine runs, and no external MAGI is attached.
 *  4. Coherence: at 100% managed with the SAME growth rate, the Roth destination
 *     is identical to having no allocation at all — because "all of it managed
 *     at the annuity rate" IS just "convert it all". If these ever diverge, the
 *     sleeve accounting has drifted.
 *  5. The managed sleeve is a strict subset of rothBalance, every year.
 *  6. aum_growth_rate actually bites, monotonically.
 *  7. GI products ignore the destination entirely (their engine has no sleeve).
 *  8. The Roth destination beats the taxable brokerage on net legacy.
 */
import type { Client as ClientType } from '../../../types/client';
import { makeClient, dispatch } from './factory';
import { Reporter } from './assertions';
import {
  aumSliceGoesToRoth,
  aumSliceGoesToTaxableBrokerage,
  managedRothShare,
} from '../../utils/aum-destination';
import { withAumPullMagi } from '../../utils/aum-magi';
import { runAumScenario } from '../../scenarios/aum';
import type { YearlyResult } from '../../types';

const r = new Reporter();
const TOL = 100;

const BASE: Partial<ClientType> = {
  age: 65, end_age: 95, filing_status: 'married_filing_jointly', blueprint_type: 'none',
  qualified_account_value: 200_000_000, taxable_accounts: 25_000_000, roth_ira: 0,
  rate_of_return: 6, baseline_comparison_rate: 6, post_contract_rate: 6, max_tax_rate: 24,
  conversion_type: 'optimized_amount', tax_payment_source: 'from_ira',
  rmd_treatment: 'reinvested', ssi_annual_amount: 4_000_000, ssi_payout_age: 67,
  heir_tax_rate: 40, ltcg_rate: 15, aum_fee_percent: 1, aum_withdrawal_years: 5,
};
const run = (o: Partial<ClientType> = {}) => dispatch(makeClient({ ...BASE, ...o } as Partial<ClientType>), 2026);
const rec = (check: string, note: string, fixture = 'aum-destination') =>
  r.record({ fixture, scenario: 'formula', check, year: 2026, age: 65, note });
// dispatch() returns the CLIENT alongside the year arrays, so a whole-object
// JSON compare differs the moment a new client field exists. Compare the engine
// output only.
const sides = (d: ReturnType<typeof run>) => JSON.stringify({ formula: d.formula, baseline: d.baseline });

// dispatch() does NOT apply aum_allocation_percent — the projections ROUTE does
// (buildRothSideClient + runAumOverlay). Anything comparing the taxable split
// against the Roth destination has to replicate the route, or both sides run
// unsplit and the comparison is vacuous. (This is the trap that hid the
// combineRothAndAum bug; see [[project-advisory-fee-feature]].)
function routeLike(over: Partial<ClientType>) {
  const client = makeClient({ ...BASE, ...over } as Partial<ClientType>);
  const split = aumSliceGoesToTaxableBrokerage(client);
  const rothSideBase: ClientType = split
    ? { ...client, qualified_account_value: Math.round((client.qualified_account_value ?? 0) * (1 - (client.aum_allocation_percent ?? 0) / 100)) }
    : client;
  const strat = dispatch(withAumPullMagi(rothSideBase, client), 2026);
  let formula: YearlyResult[] = strat.formula;
  if (split) {
    const aum = runAumScenario({
      startingIraPortion: Math.round((client.qualified_account_value ?? 0) * ((client.aum_allocation_percent ?? 0) / 100)),
      client, startYear: 2026, projectionYears: strat.formula.length,
    });
    formula = strat.formula.map((y, i) => ({
      ...y,
      traditionalBalance: y.traditionalBalance + aum[i].traditionalBalance,
      rothBalance: y.rothBalance + aum[i].rothBalance,
      taxableBalance: y.taxableBalance + aum[i].taxableBalance,
      conversionAmount: (y.conversionAmount ?? 0) + (aum[i].conversionAmount ?? 0),
    }));
  }
  return { formula, baseline: split ? dispatch(client, 2026).baseline : strat.baseline };
}

const H = 0.40;
const legacy = (rows: YearlyResult[]) => {
  const y = rows[rows.length - 1];
  return Math.round(y.traditionalBalance * (1 - H)) + y.rothBalance + (y.taxableBalance || 0);
};

// ---- 1. null == explicit 'taxable' -----------------------------------------
{
  const nul = run({ aum_allocation_percent: 40 });
  const tax = run({ aum_allocation_percent: 40, aum_destination: 'taxable' });
  r.ran();
  if (sides(nul) !== sides(tax)) {
    rec('null-equals-taxable', 'a null aum_destination must behave exactly as taxable, or every live AUM client moves');
  }
  r.ran();
  const off = run({ aum_allocation_percent: 0 });
  if (!off.formula.every((y) => (y.rothManagedBalance ?? 0) === 0)) {
    rec('no-sleeve-without-the-destination', 'rothManagedBalance populated with no Roth destination set');
  }
}

// ---- 2/3. the Roth destination converts; the taxable one does not ----------
{
  const rothC = makeClient({ ...BASE, aum_allocation_percent: 100, aum_destination: 'roth' } as Partial<ClientType>);
  const taxC = makeClient({ ...BASE, aum_allocation_percent: 100, aum_destination: 'taxable' } as Partial<ClientType>);

  r.ran();
  if (!(aumSliceGoesToRoth(rothC) && !aumSliceGoesToTaxableBrokerage(rothC))) {
    rec('roth-destination-recognised', 'aumSliceGoesToRoth/ToTaxableBrokerage disagree on a roth-destination client');
  }
  r.ran();
  if (!(aumSliceGoesToTaxableBrokerage(taxC) && !aumSliceGoesToRoth(taxC))) {
    rec('taxable-destination-recognised', 'helpers disagree on a taxable-destination client');
  }
  r.ran();
  if (Math.abs(managedRothShare(rothC) - 1) > 1e-9 || managedRothShare(taxC) !== 0) {
    rec('managed-share', `roth=${managedRothShare(rothC)} taxable=${managedRothShare(taxC)}`);
  }
  // No external MAGI schedule may be attached under the Roth destination: the
  // conversion is already counted by the engine, so adding it again would
  // double-charge the IRMAA cap and shrink conversions for phantom income.
  r.ran();
  if (withAumPullMagi(rothC, rothC).external_magi_income_by_year != null) {
    rec('no-external-magi-under-roth', 'withAumPullMagi attached a pull schedule for a bucket that does not exist');
  }
  r.ran();
  if (withAumPullMagi(taxC, taxC).external_magi_income_by_year == null) {
    rec('external-magi-still-applied-for-taxable', 'the v81 IRMAA fix stopped applying to taxable AUM clients');
  }

  const rothRun = routeLike({ aum_allocation_percent: 100, aum_destination: 'roth' });
  const taxRun = routeLike({ aum_allocation_percent: 100, aum_destination: 'taxable' });
  r.ran();
  if (!((rothRun.formula[0].conversionAmount ?? 0) > 0)) {
    rec('roth-destination-converts', 'the whole point: the slice must be Roth converted, and nothing converted');
  }
  r.ran();
  if ((taxRun.formula[0].conversionAmount ?? 0) !== 0) {
    rec('taxable-destination-still-converts-nothing', 'the taxable brokerage path changed behaviour');
  }
  // The IRA must NOT be carved under 'roth' — year-1 BOY Traditional is the full balance.
  r.ran();
  if (Math.abs((rothRun.formula[0].traditionalBOY ?? 0) - (BASE.qualified_account_value ?? 0)) > TOL) {
    r.record({
      fixture: 'aum-destination', scenario: 'formula', check: 'ira-not-carved-under-roth',
      year: 2026, age: 65, expected: BASE.qualified_account_value ?? 0,
      actual: rothRun.formula[0].traditionalBOY ?? 0,
      note: 'the Roth destination must leave the IRA whole so the conversion stays bracket- and IRMAA-aware',
    });
  }

  // ---- 8. and it must beat the brokerage on net legacy ---------------------
  r.ran();
  if (!(legacy(rothRun.formula) > legacy(taxRun.formula))) {
    r.record({
      fixture: 'aum-destination', scenario: 'formula', check: 'roth-beats-taxable-brokerage',
      year: 2026, age: 95, expected: legacy(taxRun.formula), actual: legacy(rothRun.formula),
      note: 'same ordinary tax at transfer, but a Roth has no ongoing drag and no RMDs — it cannot lose',
    });
  }

  // ---- 4. coherence: 100% managed at the same rate == no allocation --------
  const none = routeLike({ aum_allocation_percent: 0 });
  r.ran();
  if (legacy(rothRun.formula) !== legacy(none.formula)) {
    r.record({
      fixture: 'aum-destination', scenario: 'formula', check: 'all-managed-same-rate-is-a-noop',
      year: 2026, age: 95, expected: legacy(none.formula), actual: legacy(rothRun.formula),
      note: '"all of it managed at the annuity rate" IS "convert it all" — a difference means the sleeve accounting has drifted',
    });
  }
}

// ---- 5/6. the sleeve is a subset, and its rate bites ------------------------
{
  const byRate: Record<number, number> = {};
  for (const g of [4, 6, 8]) {
    const res = run({ aum_allocation_percent: 40, aum_destination: 'roth', aum_growth_rate: g });
    byRate[g] = legacy(res.formula);
    for (const y of res.formula) {
      r.ran();
      const sleeve = y.rothManagedBalance ?? 0;
      if (sleeve < 0 || sleeve > y.rothBalance + TOL) {
        r.record({
          fixture: `aum-destination/rate${g}`, scenario: 'formula', check: 'sleeve-is-a-subset-of-roth',
          year: y.year, age: y.age, expected: y.rothBalance, actual: sleeve,
          note: 'the managed sleeve drifted outside the Roth balance it is part of',
        });
        break;
      }
    }
  }
  r.ran();
  if (!(byRate[4] < byRate[6] && byRate[6] < byRate[8])) {
    rec('managed-growth-rate-bites', `net legacy by managed rate: 4%=${byRate[4]} 6%=${byRate[6]} 8%=${byRate[8]} — must increase`);
  }
}

// ---- 7. GI ignores the destination ------------------------------------------
{
  const giBase: Partial<ClientType> = {
    ...BASE, blueprint_type: 'compound-rollup-income', income_start_age: 70,
    guaranteed_rate_of_return: 7, payout_type: 'individual', aum_allocation_percent: 100,
  };
  const giRoth = makeClient({ ...giBase, aum_destination: 'roth' } as Partial<ClientType>);
  r.ran();
  if (aumSliceGoesToRoth(giRoth) || !aumSliceGoesToTaxableBrokerage(giRoth)) {
    rec('gi-ignores-the-destination',
      'the GI engine has no managed sleeve, so honouring the destination there would be half-applied — it must fall back to taxable',
      'aum-destination/gi');
  }
  r.ran();
  if (managedRothShare(giRoth) !== 0) {
    rec('gi-managed-share-zero', `managedRothShare returned ${managedRothShare(giRoth)} for a GI client`, 'aum-destination/gi');
  }
  const a = dispatch(makeClient(giBase as Partial<ClientType>), 2026);
  const b = dispatch(giRoth, 2026);
  r.ran();
  if (sides(a) !== sides(b)) {
    rec('gi-result-unchanged', 'setting the destination moved a GI projection', 'aum-destination/gi');
  }
}

r.print('AUM destination — value checks');
process.exit(r.breaches.length > 0 ? 1 : 0);
