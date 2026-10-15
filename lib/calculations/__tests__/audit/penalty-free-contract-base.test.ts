/**
 * Penalty-free cap — contract-value base + full/fixed tax funding.
 *
 * Run: npx tsx lib/calculations/__tests__/audit/penalty-free-contract-base.test.ts
 *
 * Two bugs from the Dana Gibson / Chau Tran ticket (9194bf6f), both under
 * respect_penalty_free_limit + tax_only + tax paid from the IRA:
 *   1. The allowance was pf% × the UNCONVERTED balance only. The converted Roth
 *      stays in the contract (it keeps the carrier bonus and pays the rider fee
 *      on total AV), so the allowance is pf% × (unconverted + in-annuity Roth).
 *   2. full_conversion / fixed_amount priced the tax on the conversion alone.
 *      The pull that funds the tax is itself taxable, so the year's tax came out
 *      higher than what was withdrawn, and the difference was never paid.
 *
 * Every check is against an independent quantity: the tax a conversion adds is
 * measured as totalTax(with conversion) − totalTax(no conversion) on otherwise
 * identical clients, not read from the engine's own conversion-tax fields.
 */

import type { Client } from '../../../types/client';
import { makeClient, dispatch } from './factory';
import { Reporter } from './assertions';

const r = new Reporter();
const TOL = 200; // $2 in cents — rounding only
const PF = 10;

// Age 61, no Social Security until 70, no other income: the conversion is the
// only thing that changes the tax, so the marginal-tax identity is exact.
const base: Partial<Client> = {
  age: 61, end_age: 90, qualified_account_value: 100_000_000,
  blueprint_type: 'fia', bonus_percent: 11, surrender_years: 10, rate_of_return: 7,
  tax_payment_source: 'from_ira', taxable_accounts: 0, roth_ira: 0,
  respect_penalty_free_limit: true, penalty_free_scope: 'tax_only', penalty_free_percent: PF,
  max_tax_rate: 37, constraint_type: 'bracket_ceiling',
  filing_status: 'married_filing_jointly', spouse_age: 60, state_tax_rate: 9.3,
  ssi_annual_amount: 4_000_000, ssi_payout_age: 70, spouse_ssi_annual_amount: 0,
  non_ssi_income: [],
};

const run = (o: Partial<Client>) => dispatch(makeClient({ ...base, ...o } as Partial<Client>), 2026);
const none = run({ conversion_type: 'no_conversion' });

function check(fixture: string, name: string, ok: boolean, expected?: number, actual?: number, note?: string) {
  r.ran();
  if (!ok) r.record({ fixture, scenario: 'formula', check: name, expected, actual, delta: actual != null && expected != null ? actual - expected : undefined, note });
}

const cases: Array<[string, Partial<Client>]> = [
  ['full', { conversion_type: 'full_conversion' }],
  ['fixed-big', { conversion_type: 'fixed_amount', fixed_conversion_amount: 50_000_000 }],
  ['fixed-small', { conversion_type: 'fixed_amount', fixed_conversion_amount: 15_000_000 }],
  ['optimized', { conversion_type: 'optimized_amount' }],
];

const schedules: Record<string, number[]> = {};
for (const [name, o] of cases) {
  const { formula } = run(o);
  schedules[name] = formula.map((y) => y.conversionAmount);
  let exceedsUnconvertedBase = false;
  formula.forEach((y, i) => {
    if (i >= 8) return; // SS starts at 70 (year 9)
    const n0 = none.formula[i];
    // IRMAA is excluded: a conversion raises Medicare premiums two years later
    // (lookback), a real cost but paid from income, not withdrawn with the tax.
    const marginal = (y.totalTax - (y.irmaaSurcharge ?? 0)) - (n0.totalTax - (n0.irmaaSurcharge ?? 0));
    const paid = (y.taxesPaidFromIRA ?? 0) + (y.taxesPaidExternally ?? 0);
    // 1. Every dollar of the conversion's tax is paid.
    check(name, 'conversion-tax-funded', Math.abs(marginal - paid) <= TOL, marginal, paid, `${y.year}: tax the conversion adds vs tax withdrawn to pay it`);
    // 2. IRA-paid tax within pf% of the contract (no outside Roth here, so rothBOY is all in-annuity).
    if (i < 10) {
      const contractCap = Math.round(((y.traditionalBOY ?? 0) + (y.rothBOY ?? 0)) * PF / 100);
      check(name, 'within-contract-allowance', (y.taxesPaidFromIRA ?? 0) <= contractCap + TOL, contractCap, y.taxesPaidFromIRA, `${y.year}`);
      if ((y.taxesPaidFromIRA ?? 0) > Math.round((y.traditionalBOY ?? 0) * PF / 100) + TOL) exceedsUnconvertedBase = true;
    }
    check(name, 'no-external-tax', (y.taxesPaidExternally ?? 0) <= TOL, 0, y.taxesPaidExternally, 'tax-from-IRA client with $0 taxable must not lean on outside money');
  });
  // 3. The contract base is in use (cap-bound cases only).
  if (name !== 'fixed-small') {
    check(name, 'uses-contract-base', exceedsUnconvertedBase, undefined, undefined, 'some year should pull tax above pf% of the unconverted balance alone');
  }
}

// 5. Bracket ceiling at 37% doesn't bind, so full and optimized are both bounded
//    only by the allowance: same schedule.
schedules.full.forEach((v, i) => check('full-vs-optimized', 'same-schedule-when-cap-binds', Math.abs(v - schedules.optimized[i]) <= TOL, schedules.optimized[i], v, `year ${i + 1}`));

// 6. A fixed amount the allowance never restricts converts exactly that amount.
{
  const { formula } = run({ conversion_type: 'fixed_amount', fixed_conversion_amount: 15_000_000 });
  formula.slice(0, 4).forEach((y) => check('fixed-small', 'fixed-amount-honoured', y.conversionAmount === 15_000_000, 15_000_000, y.conversionAmount, `${y.year}`));
}

// 4. An outside Roth IRA is not part of the contract and must not raise the allowance.
{
  const outside = 50_000_000; // $500K pre-existing Roth, grows at rate_of_return
  const { formula } = run({ conversion_type: 'optimized_amount', roth_ira: outside });
  formula.slice(0, 10).forEach((y, i) => {
    const outsideNow = Math.round(outside * Math.pow(1.07, i));
    const inAnnuityRoth = Math.max(0, (y.rothBOY ?? 0) - outsideNow);
    const cap = Math.round(((y.traditionalBOY ?? 0) + inAnnuityRoth) * PF / 100);
    check('outside-roth', 'outside-roth-excluded', (y.taxesPaidFromIRA ?? 0) <= cap + 50_000, cap, y.taxesPaidFromIRA, `${y.year}: allowance must not include the outside Roth (tolerance covers compounding rounding)`);
  });
}

// 7. The exported allowance base (read by the report's penalty-free warning)
//    is the base the cap used: contract value under tax_only, unconverted under
//    all_distributions — so the warning and the engine can't disagree.
for (const scope of ['tax_only', 'all_distributions'] as const) {
  const { formula } = run({ conversion_type: 'optimized_amount', penalty_free_scope: scope });
  formula.slice(0, 10).forEach((y) => {
    const expected = scope === 'tax_only' ? (y.traditionalBOY ?? 0) + (y.rothBOY ?? 0) : (y.traditionalBOY ?? 0);
    check(`base/${scope}`, 'exported-allowance-base', Math.abs((y.penaltyFreeAllowanceBase ?? -1) - expected) <= TOL, expected, y.penaltyFreeAllowanceBase, `${y.year}`);
  });
}

r.print('Penalty-free cap — contract base + full/fixed tax funding');
process.exit(r.breaches.length > 0 ? 1 : 0);
