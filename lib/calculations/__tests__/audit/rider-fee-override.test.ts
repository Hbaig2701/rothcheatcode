/**
 * Per-scenario rider fee override (clients.rider_fee_percent) — Growth engine.
 *
 * Run: npx tsx lib/calculations/__tests__/audit/rider-fee-override.test.ts
 *
 * The High-Bonus Growth presets carry a 0.95% rider fee. Advisors can now
 * override it per scenario (Ken Orenstein, Oct 2026: "a rider fee charge that I
 * did not input, how do I change it to zero?").
 *
 * What is locked here:
 *  1. null (no override) is byte-identical to before: same rows as an explicit
 *     0.95 on a 0.95% preset — existing scenarios don't move.
 *  2. 0 removes the fee entirely (every year's riderFee is 0) and the strategy
 *     ends with MORE net worth than with the fee.
 *  3. Magnitude — year 1's fee scales exactly with the rate (same pre-fee AV).
 *  4. The fee still stops after the surrender period.
 *  5. The baseline never carries the annuity, so it is untouched by the override.
 *  6. Resolver precedence: override > custom product > preset, an explicit 0
 *     wins, and a non-finite override is ignored.
 */
import type { Client as ClientType } from '../../../types/client';
import type { CustomProductRow } from '../../../products/types';
import { makeClient, dispatch } from './factory';
import { Reporter } from './assertions';
import { getEffectiveGrowthRiderFee } from '../../resolvers/product-resolver';

const r = new Reporter();
const F = 'rider-fee-override';

// Shaped like the ticket's scenario: 72, ~$317K IRA, High-Bonus Long-Term, 19% bonus.
const BASE: Partial<ClientType> = {
  age: 72,
  end_age: 90,
  blueprint_type: 'high-bonus-long-term-growth',
  qualified_account_value: 31_728_900,
  bonus_percent: 19,
  surrender_years: 10,
  rate_of_return: 6,
  baseline_comparison_rate: 6,
  post_contract_rate: 6,
  max_tax_rate: 24,
  conversion_type: 'optimized_amount',
  heir_tax_rate: 30,
};

const run = (rider_fee_percent: number | null) =>
  dispatch(makeClient({ ...BASE, rider_fee_percent }));

const none = run(null);
const preset = run(0.95);
const zero = run(0);
const high = run(1.5);

// 1. null === explicit preset value, row for row.
r.ran();
if (JSON.stringify(none.formula) !== JSON.stringify(preset.formula)) {
  r.record({ fixture: F, scenario: 'formula', check: 'null-equals-preset', note: 'no override must reproduce the preset 0.95% exactly' });
}
r.ran();
if (!(none.formula[0].riderFee! > 0)) {
  r.record({ fixture: F, scenario: 'formula', check: 'preset-charges-fee', actual: none.formula[0].riderFee, note: 'the 0.95% preset should charge a year-1 rider fee' });
}

// 2. 0 removes the fee and leaves the client better off.
r.ran();
const zeroFees = zero.formula.filter((y) => (y.riderFee ?? 0) !== 0);
if (zeroFees.length) {
  r.record({ fixture: F, scenario: 'formula', check: 'zero-means-no-fee', year: zeroFees[0].year, actual: zeroFees[0].riderFee });
}
r.ran();
const lastZero = zero.formula[zero.formula.length - 1].netWorth;
const lastNone = none.formula[none.formula.length - 1].netWorth;
if (!(lastZero > lastNone)) {
  r.record({ fixture: F, scenario: 'formula', check: 'zero-fee-ends-richer', expected: lastNone, actual: lastZero });
}

// 3. Year-1 fee scales linearly with the rate (pre-fee AV is identical in year 1).
r.ran();
const expectedHigh = Math.round((none.formula[0].riderFee! / 0.0095) * 0.015);
if (Math.abs(high.formula[0].riderFee! - expectedHigh) > 2) {
  r.record({ fixture: F, scenario: 'formula', check: 'fee-scales-with-rate', expected: expectedHigh, actual: high.formula[0].riderFee });
}

// 4. No fee after the surrender period, whatever the override.
r.ran();
const afterSurrender = high.formula.slice(BASE.surrender_years!).filter((y) => (y.riderFee ?? 0) !== 0);
if (afterSurrender.length) {
  r.record({ fixture: F, scenario: 'formula', check: 'fee-stops-after-surrender', year: afterSurrender[0].year, actual: afterSurrender[0].riderFee });
}
r.ran();
const inSurrender = high.formula.slice(0, BASE.surrender_years!).filter((y) => y.traditionalBalance + y.rothBalance > 0);
if (inSurrender.some((y) => !((y.riderFee ?? 0) > 0))) {
  r.record({ fixture: F, scenario: 'formula', check: 'fee-charged-through-surrender', note: 'an in-surrender year with a balance charged no fee' });
}

// 5. Baseline untouched.
for (const [label, res] of [['zero', zero], ['high', high]] as const) {
  r.ran();
  if (JSON.stringify(res.baseline) !== JSON.stringify(none.baseline)) {
    r.record({ fixture: `${F}:${label}`, scenario: 'baseline', check: 'baseline-unchanged' });
  }
}

// 6. Resolver precedence.
const custom = (fee?: number) =>
  ({ config: { fees: fee === undefined ? {} : { annual_rider_fee: fee } } }) as unknown as CustomProductRow;
const cases: Array<[string, number, number]> = [
  ['preset only', getEffectiveGrowthRiderFee('high-bonus-long-term-growth', null, null), 0.0095],
  ['custom beats preset', getEffectiveGrowthRiderFee('high-bonus-long-term-growth', custom(2), null), 0.02],
  ['override beats custom', getEffectiveGrowthRiderFee('high-bonus-long-term-growth', custom(2), 1.1), 0.011],
  ['explicit 0 wins', getEffectiveGrowthRiderFee('high-bonus-long-term-growth', custom(2), 0), 0],
  ['override on a no-fee preset', getEffectiveGrowthRiderFee('vesting-bonus-growth', null, 0.5), 0.005],
  ['NaN override ignored', getEffectiveGrowthRiderFee('high-bonus-long-term-growth', null, Number.NaN), 0.0095],
  ['custom without fee falls to preset', getEffectiveGrowthRiderFee('high-bonus-long-term-growth', custom(), null), 0.0095],
];
for (const [name, actual, expected] of cases) {
  r.ran();
  if (Math.abs(actual - expected) > 1e-12) {
    r.record({ fixture: `${F}:resolver`, scenario: 'formula', check: name, expected, actual });
  }
}

r.print('Per-scenario rider fee override — value checks');
process.exit(r.breaches.length > 0 ? 1 : 0);
