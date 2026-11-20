/**
 * Growth rider/product fee duration (config.fees.fee_duration).
 *
 * Run: npx tsx lib/calculations/__tests__/audit/rider-fee-duration.test.ts
 *
 * Before Nov 2026 the growth engine charged the fee during the surrender period
 * only and ignored fee_duration. Revol One BonusRev Max charges 0.95% every
 * anniversary for life, so the engine now honors 'lifetime' and a year count;
 * 'surrender_period' / missing / 0 keep the old behavior (no existing product
 * changes).
 */
import { makeClient } from './factory';
import { Reporter } from './assertions';
import { runGrowthSimulation, createSimulationInput } from '../..';
import { getEffectiveGrowthRiderFeeYears } from '../../resolvers/product-resolver';

const r = new Reporter();
const F = 'rider-fee-duration';
const prod = (fee_duration: unknown) => ({
  id: 'p', name: 'p', engine_preset: 'vesting-bonus-growth', category: 'growth',
  config: {
    bonus: { percentage: 10, type: 'vesting' },
    surrender: { years: 10, schedule: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] },
    fees: { annual_rider_fee: 1, fee_duration },
    withdrawals: { penalty_free_percent: 10, year_1_rule: 'same', cumulative_withdrawal: false },
    other: { mva_applies: false },
  },
}) as never;

// Resolver
for (const [d, exp] of [['surrender_period', 10], [undefined, 10], [0, 10], ['lifetime', Infinity], [5, 5], ['15', 15], ['junk', 10]] as const) {
  r.ran();
  const got = getEffectiveGrowthRiderFeeYears(prod(d), 10);
  if (got !== exp) r.record({ fixture: F, scenario: 'formula', check: `resolver fee_duration=${String(d)}`, expected: exp, actual: got });
}

// Engine: fee years charged
for (const [d, expYears] of [['surrender_period', 10], ['lifetime', 'all'], [5, 5]] as const) {
  const c = makeClient({ age: 65, end_age: 94, qualified_account_value: 50_000_000, blueprint_type: 'vesting-bonus-growth', bonus_percent: 10, surrender_years: 10, conversion_type: 'no_conversion', rmd_treatment: 'reinvested' });
  const res = runGrowthSimulation(createSimulationInput(c, prod(d)));
  const charged = res.formula.filter((y) => (y.riderFee ?? 0) > 0).length;
  const want = expYears === 'all' ? res.formula.length : expYears;
  r.ran();
  if (charged !== want) r.record({ fixture: F, scenario: 'formula', check: `engine fee years for ${String(d)}`, note: `expected ${want} years, got ${charged}` });
}

r.print('Growth rider fee duration');
process.exit(r.breaches.length > 0 ? 1 : 0);
