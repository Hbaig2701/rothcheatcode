/**
 * QLAC overlay — mechanics + THEORY checks.
 *
 * Run: npx tsx lib/calculations/__tests__/audit/qlac-theory.test.ts
 *
 * Drives the same transform → engine → overlay pipeline the projections route
 * runs (applyQlacToClient before the sim, applyQlacOverlay after) across the
 * three engines and checks it against the IRS rules, not just itself:
 *   - off = byte-identical: no qlac_premium → every row unchanged
 *   - carve-out: the strategy's starting IRA is the full IRA minus the premium,
 *     and the premium never earns the FIA bonus
 *   - RMD base: with no conversions, the strategy's RMD in the first RMD year is
 *     exactly the baseline's RMD scaled by (IRA − premium) / IRA — the premium is
 *     out of the divisor base
 *   - payout timing: qlacPayout = 0 before the start age, = the quoted income from
 *     it on, and each payout is inside that row's otherIncome (so it's taxed)
 *   - return of premium: death benefit = premium − cumulative payouts, floored,
 *     and 0 in every row for life-only
 *   - banking per rmd_treatment: spent → bank 0 (and cumulativeDistributions
 *     carries the after-tax income); cash → bank = Σ after-tax with no growth;
 *     reinvested → bank grows at the comparison rate
 *   - netWorth = traditional + roth + taxable + qlacDeathBenefit on every row
 *   - qlac_in_baseline: the baseline gets the same carve-out + overlay
 *   - premium is clamped at the IRA balance; income start age past the horizon
 *     produces no payouts and a full-premium death benefit throughout
 */

import type { Client } from '../../../types/client';
import type { YearlyResult } from '../../types';
import { makeClient, dispatch } from './factory';
import { Reporter } from './assertions';
import { applyQlacToClient, applyQlacOverlay, getQlacPremium, computeQlacPayoutSchedule } from '../../utils/qlac';
import { applyHeldBackIraRmd } from '../../utils/held-back-ira';

const r = new Reporter();
const TOL = 2; // cents

/** Mirror the route: baseline on its own inputs, strategy on the carved client, overlay after. */
function runWithQlac(raw: Client) {
  const inBaseline = raw.qlac_in_baseline === true;
  const strategyClient = applyQlacToClient(raw);
  const baselineClient = inBaseline ? strategyClient : raw;
  const baseline = dispatch(baselineClient).baseline;
  const formula = dispatch(strategyClient).formula;
  applyQlacOverlay(raw, formula);
  if (inBaseline) applyQlacOverlay(raw, baseline);
  return { baseline, formula, strategyClient };
}

function check(name: string, scenario: 'baseline' | 'formula', cond: boolean, detail: Partial<Parameters<Reporter['record']>[0]> = {}) {
  r.ran();
  if (!cond) r.record({ fixture: name, scenario, check: detail.check ?? name, ...detail });
}

const base: Partial<Client> = {
  age: 65,
  end_age: 95,
  qualified_account_value: 150_000_000,
  rate_of_return: 6,
  baseline_comparison_rate: 6,
  state: 'VA',
  state_tax_rate: 5.75,
  max_tax_rate: 24,
  ssi_payout_age: 70,
  ssi_annual_amount: 3_000_000,
  heir_tax_rate: 40,
  rmd_treatment: 'reinvested',
};

const QLAC: Partial<Client> = {
  qlac_premium: 21_000_000,
  qlac_income_start_age: 85,
  qlac_annual_income: 6_000_000,
  qlac_death_benefit: 'return_of_premium',
};

// ---------------------------------------------------------------------------
// 1. OFF = byte-identical across all three engines
// ---------------------------------------------------------------------------
for (const bp of ['fia', 'none', 'simple-rollup-income'] as Client['blueprint_type'][]) {
  const raw = makeClient({ ...base, blueprint_type: bp });
  const plain = dispatch(raw);
  const withOff = runWithQlac(raw);
  const name = `qlac-off/${bp}`;
  check(name, 'formula', JSON.stringify(plain.formula) === JSON.stringify(withOff.formula), { check: 'off-identical-formula' });
  check(name, 'baseline', JSON.stringify(plain.baseline) === JSON.stringify(withOff.baseline), { check: 'off-identical-baseline' });
  check(name, 'formula', withOff.formula.every((y) => y.qlacPayout === undefined && y.qlacDeathBenefit === undefined), { check: 'off-no-fields' });
}

// ---------------------------------------------------------------------------
// 2. Carve-out + bonus: strategy year-1 BOY IRA = (IRA − premium) × (1 + bonus)
// ---------------------------------------------------------------------------
{
  const raw = makeClient({ ...base, ...QLAC, blueprint_type: 'fia', bonus_percent: 10, conversion_type: 'no_conversion' });
  const { formula, strategyClient } = runWithQlac(raw);
  const name = 'qlac-carveout/fia-bonus10';
  check(name, 'formula', strategyClient.qualified_account_value === 150_000_000 - 21_000_000, { check: 'carved-ira', expected: 129_000_000, actual: strategyClient.qualified_account_value });
  const boy = formula[0].traditionalBOY ?? NaN;
  const expectBoy = Math.round(129_000_000 * 1.10);
  check(name, 'formula', Math.abs(boy - expectBoy) <= TOL, { check: 'bonus-on-remaining-only', year: formula[0].year, age: formula[0].age, expected: expectBoy, actual: boy, delta: boy - expectBoy });
}

// ---------------------------------------------------------------------------
// 3. RMD base: no conversions, no bonus, same growth both sides →
//    strategy RMD at RMD start = baseline RMD × (IRA − P) / IRA
// ---------------------------------------------------------------------------
{
  const raw = makeClient({ ...base, ...QLAC, blueprint_type: 'none', bonus_percent: 0, conversion_type: 'no_conversion' });
  const { baseline, formula } = runWithQlac(raw);
  const name = 'qlac-rmd-base/no-conversion';
  const i = baseline.findIndex((y) => y.rmdAmount > 0);
  check(name, 'baseline', i >= 0, { check: 'baseline-has-rmd' });
  if (i >= 0) {
    const ratio = (150_000_000 - 21_000_000) / 150_000_000;
    const expect = Math.round(baseline[i].rmdAmount * ratio);
    const actual = formula[i].rmdAmount;
    check(name, 'formula', Math.abs(actual - expect) <= 100, { check: 'rmd-scaled-by-carveout', year: formula[i].year, age: formula[i].age, expected: expect, actual, delta: actual - expect });
    check(name, 'formula', actual < baseline[i].rmdAmount, { check: 'rmd-lower-than-baseline', year: formula[i].year, age: formula[i].age, expected: baseline[i].rmdAmount, actual });
  }
}

// ---------------------------------------------------------------------------
// 4. Payout timing, taxation, ROP schedule, banking — per engine + treatment
// ---------------------------------------------------------------------------
type Treatment = NonNullable<Client['rmd_treatment']>;
const grid: { bp: Client['blueprint_type']; treatment: Treatment; db: 'return_of_premium' | 'none'; start: number }[] = [
  { bp: 'fia', treatment: 'reinvested', db: 'return_of_premium', start: 85 },
  { bp: 'fia', treatment: 'spent', db: 'return_of_premium', start: 80 },
  { bp: 'fia', treatment: 'cash', db: 'none', start: 82 },
  { bp: 'none', treatment: 'reinvested', db: 'none', start: 85 },
  { bp: 'simple-rollup-income', treatment: 'reinvested', db: 'return_of_premium', start: 80 },
];
for (const g of grid) {
  const raw = makeClient({ ...base, ...QLAC, blueprint_type: g.bp, rmd_treatment: g.treatment, qlac_death_benefit: g.db, qlac_income_start_age: g.start });
  const { formula } = runWithQlac(raw);
  const name = `qlac-mech/${g.bp}/${g.treatment}/${g.db}/start${g.start}`;
  const premium = getQlacPremium(raw);
  const income = raw.qlac_annual_income ?? 0;
  const growth = (raw.baseline_comparison_rate ?? 0) / 100;

  let cumPay = 0;
  let cumAfterTax = 0;
  let prevBank = 0;
  for (const y of formula) {
    const payout = y.qlacPayout ?? 0;
    const expectPayout = y.age >= g.start ? income : 0;
    check(name, 'formula', payout === expectPayout, { check: 'payout-timing', year: y.year, age: y.age, expected: expectPayout, actual: payout });
    if (payout > 0) {
      check(name, 'formula', (y.otherIncome ?? 0) >= payout, { check: 'payout-in-other-income', year: y.year, age: y.age, expected: payout, actual: y.otherIncome });
    }
    cumPay += payout;
    const expectDb = g.db === 'return_of_premium' ? Math.max(0, premium - cumPay) : 0;
    check(name, 'formula', (y.qlacDeathBenefit ?? 0) === expectDb, { check: 'rop-death-benefit', year: y.year, age: y.age, expected: expectDb, actual: y.qlacDeathBenefit });

    const sum = y.traditionalBalance + y.rothBalance + y.taxableBalance + (y.qlacDeathBenefit ?? 0);
    check(name, 'formula', Math.abs(sum - y.netWorth) <= TOL, { check: 'networth-composition', year: y.year, age: y.age, field: 'netWorth', expected: sum, actual: y.netWorth, delta: y.netWorth - sum });

    const bank = y.qlacReinvested ?? 0;
    const afterTaxThisYear = bank - (g.treatment === 'reinvested' ? prevBank + Math.round(prevBank * growth) : prevBank);
    if (g.treatment === 'spent') {
      check(name, 'formula', bank === 0, { check: 'spent-bank-zero', year: y.year, age: y.age, actual: bank });
    } else {
      // Bank only grows when there's a payout to add or (reinvested) a prior balance to grow.
      check(name, 'formula', bank >= prevBank, { check: 'bank-monotone', year: y.year, age: y.age, expected: prevBank, actual: bank });
      if (payout > 0) {
        // After-tax payout must be between 50% and 100% of the gross (ordinary + 5.75% state, ≤ 37% fed).
        check(name, 'formula', afterTaxThisYear > payout * 0.5 && afterTaxThisYear <= payout, { check: 'after-tax-band', year: y.year, age: y.age, expected: payout, actual: afterTaxThisYear });
        cumAfterTax += afterTaxThisYear;
      } else {
        check(name, 'formula', Math.abs(afterTaxThisYear) <= TOL, { check: 'no-payout-no-deposit', year: y.year, age: y.age, actual: afterTaxThisYear });
      }
      if (g.treatment === 'cash') {
        check(name, 'formula', Math.abs(bank - cumAfterTax) <= TOL * formula.length, { check: 'cash-bank-is-sum', year: y.year, age: y.age, expected: cumAfterTax, actual: bank, delta: bank - cumAfterTax });
      }
    }
    prevBank = bank;
  }
  const last = formula[formula.length - 1];
  const payoutYears = formula.filter((y) => (y.qlacPayout ?? 0) > 0).length;
  check(name, 'formula', payoutYears === Math.max(0, raw.end_age - g.start), { check: 'payout-year-count', expected: Math.max(0, raw.end_age - g.start), actual: payoutYears });
  if (g.treatment === 'spent') {
    // Spent: cumulativeDistributions must carry the after-tax QLAC income on the last row.
    check(name, 'formula', (last.cumulativeDistributions ?? 0) > 0, { check: 'spent-cumulative-distributions', actual: last.cumulativeDistributions });
  }
}

// ---------------------------------------------------------------------------
// 5. qlac_in_baseline: baseline also carved + overlaid; comparison isolates Roth
// ---------------------------------------------------------------------------
{
  const raw = makeClient({ ...base, ...QLAC, blueprint_type: 'fia', qlac_in_baseline: true });
  const { baseline, formula } = runWithQlac(raw);
  const name = 'qlac-in-baseline/fia';
  check(name, 'baseline', (baseline[0].traditionalBOY ?? 0) === 150_000_000 - 21_000_000, { check: 'baseline-carved', expected: 129_000_000, actual: baseline[0].traditionalBOY });
  check(name, 'baseline', baseline.every((y) => (y.age >= 85 ? (y.qlacPayout ?? 0) === 6_000_000 : (y.qlacPayout ?? 0) === 0)), { check: 'baseline-payouts' });
  check(name, 'baseline', baseline.every((y) => Math.abs(y.traditionalBalance + y.rothBalance + y.taxableBalance + (y.qlacDeathBenefit ?? 0) - y.netWorth) <= TOL), { check: 'baseline-networth-composition' });
  // Same QLAC on both sides → identical payout + death-benefit schedules.
  check(name, 'formula', baseline.every((y, i) => y.qlacPayout === formula[i].qlacPayout && y.qlacDeathBenefit === formula[i].qlacDeathBenefit), { check: 'schedules-match-both-sides' });
}

// ---------------------------------------------------------------------------
// 6. Edge: premium > IRA clamps; start age past horizon → no payouts, full DB
// ---------------------------------------------------------------------------
{
  const raw = makeClient({ ...base, ...QLAC, blueprint_type: 'fia', qualified_account_value: 10_000_000, qlac_premium: 21_000_000 });
  const name = 'qlac-edge/premium-clamped';
  check(name, 'formula', getQlacPremium(raw) === 10_000_000, { check: 'premium-clamp', expected: 10_000_000, actual: getQlacPremium(raw) });
  const { formula } = runWithQlac(raw);
  check(name, 'formula', formula.every((y) => Number.isFinite(y.netWorth) && y.traditionalBalance >= 0), { check: 'clamped-run-finite' });
}
{
  const raw = makeClient({ ...base, ...QLAC, blueprint_type: 'fia', end_age: 80, qlac_income_start_age: 85 });
  const name = 'qlac-edge/start-after-horizon';
  check(name, 'formula', computeQlacPayoutSchedule(raw).size === 0, { check: 'no-payouts' });
  const { formula } = runWithQlac(raw);
  check(name, 'formula', formula.every((y) => (y.qlacPayout ?? 0) === 0 && y.qlacDeathBenefit === 21_000_000 && (y.qlacReinvested ?? 0) === 0), { check: 'full-db-throughout' });
}

// ---------------------------------------------------------------------------
// 7. Held-back IRA + QLAC compose: both income streams land in otherIncome
// ---------------------------------------------------------------------------
{
  const raw = makeClient({ ...base, ...QLAC, blueprint_type: 'fia', rmds_handled_externally: true, held_back_ira_balance: 50_000_000, qlac_income_start_age: 80 });
  const strategyClient = applyQlacToClient(applyHeldBackIraRmd(raw));
  const name = 'qlac-compose/held-back';
  const rows = strategyClient.non_ssi_income ?? [];
  const at82 = rows.find((e) => Number(e.age) === 82);
  check(name, 'formula', !!at82 && at82.gross_taxable > 6_000_000, { check: 'held-back-rmd-plus-qlac-in-table', expected: 6_000_000, actual: at82?.gross_taxable });
  check(name, 'formula', strategyClient.qualified_account_value === 129_000_000, { check: 'carve-after-held-back', expected: 129_000_000, actual: strategyClient.qualified_account_value });
}

// ---------------------------------------------------------------------------
// 8. Carrier golden: Global Atlantic ForeCertain (Forethought) QLAC quotes for
//    Mazhar Ahson, 2026-09-18 — $210K, Single Life w/ Cash Refund, cost basis
//    $0 (fully taxable), level payments. Two start ages, same premium:
//      D77W1D  income 01/01/2038 (age 75)  $2,768.84/mo = $33,226.08/yr
//      D77W5H  income 01/01/2043 (age 80)  $5,304.64/mo = $63,655.68/yr
//    Cumulative-payment table from page 3 of each quote; refund left = max(0,
//    $210K − cumulative). Payments begin Jan 1 of the start-age year, so the
//    first year carries a full annual amount — matching the overlay.
// ---------------------------------------------------------------------------
{
  const QUOTES = [
    { id: 'D77W1D', startAge: 75, annual: 3_322_608, firstYear: 2038, cumulative: [3322608, 6645216, 9967824, 13290432, 16613040, 19935648, 23258256, 26580864, 29903472, 33226080, 36548688] },
    { id: 'D77W5H', startAge: 80, annual: 6_365_568, firstYear: 2043, cumulative: [6365568, 12731136, 19096704, 25462272, 31827840, 38193408, 44558976, 50924544, 57290112, 63655680, 70021248] },
  ];
  for (const q of QUOTES) {
    const name = `forecertain/${q.id}`;
    const raw = makeClient({
      filing_status: 'single', state: 'VA', state_tax_rate: 5.75, date_of_birth: '1962-12-31', age: 63, end_age: 100,
      qualified_account_value: 170_000_000, blueprint_type: 'vesting-bonus-growth', bonus_percent: 0,
      rate_of_return: 5, growth_rate: 5, baseline_comparison_rate: 5, conversion_type: 'no_conversion', rmd_treatment: 'reinvested',
      qlac_premium: 21_000_000, qlac_income_start_age: q.startAge, qlac_annual_income: q.annual, qlac_death_benefit: 'return_of_premium',
    });
    const { formula, baseline } = runWithQlac(raw);
    for (const y of formula.filter((row) => row.age < q.startAge)) {
      check(name, 'formula', (y.qlacPayout ?? 0) === 0 && y.qlacDeathBenefit === 21_000_000, { check: 'pre-commencement', year: y.year, age: y.age, expected: 21_000_000, actual: y.qlacDeathBenefit });
    }
    const first = formula.find((row) => row.age === q.startAge);
    check(name, 'formula', first?.year === q.firstYear, { check: 'commencement-year', expected: q.firstYear, actual: first?.year });
    let cum = 0;
    q.cumulative.forEach((expectedCum, i) => {
      const y = formula.find((row) => row.age === q.startAge + i)!;
      cum += y.qlacPayout ?? 0;
      check(name, 'formula', cum === expectedCum, { check: 'cumulative-payments', year: y.year, age: y.age, expected: expectedCum, actual: cum });
      const expectedDb = Math.max(0, 21_000_000 - expectedCum);
      check(name, 'formula', y.qlacDeathBenefit === expectedDb, { check: 'cash-refund-remaining', year: y.year, age: y.age, expected: expectedDb, actual: y.qlacDeathBenefit });
      check(name, 'formula', (y.otherIncome ?? 0) >= q.annual, { check: 'payout-fully-taxable', year: y.year, age: y.age, expected: q.annual, actual: y.otherIncome });
    });
    // Carve-out to the dollar: strategy IRA at the first RMD year = (IRA − premium) grown at the same rate as the baseline's full IRA.
    const rmdYear = formula.find((row) => row.rmdAmount > 0)!;
    const baseRmd = baseline.find((row) => row.year === rmdYear.year)!;
    const expectedRmd = Math.round(baseRmd.rmdAmount * (170_000_000 - 21_000_000) / 170_000_000);
    check(name, 'formula', Math.abs(rmdYear.rmdAmount - expectedRmd) <= TOL, { check: 'rmd-base-excludes-premium', year: rmdYear.year, age: rmdYear.age, expected: expectedRmd, actual: rmdYear.rmdAmount });
  }
}

r.print('QLAC overlay — mechanics + theory');
process.exit(r.breaches.length > 0 ? 1 : 0);
