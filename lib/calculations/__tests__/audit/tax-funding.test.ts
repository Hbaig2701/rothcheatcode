/**
 * Every dollar of conversion tax the growth engine books must be paid by
 * someone, and the strict penalty-free cap must hold.
 *
 * Run: npx tsx lib/calculations/__tests__/audit/tax-funding.test.ts
 *
 * Fixture: no Social Security / other income and no taxable account, so ALL tax
 * is IRA-driven and paid from the IRA. Before RMDs start, each year's fed+state
 * tax must equal taxesPaidFromIRA + taxesPaidExternally. Locks two Nov 2026
 * fixes (BonusRev testing):
 *  - strict 'all_distributions' cap + full/fixed: the legacy solver taxed the
 *    conversion alone, so the tax on the pull that funds the tax was booked but
 *    never paid (~$28.5K over the surrender period on $800K).
 *  - final partial_amount year: tax scaled by the trim ratio over-pulled
 *    (~$1.6K) and the excess left the IRA unbooked.
 * Plus: under the strict cap, totalIRAWithdrawal <= allowance x BOY each
 * surrender year (the legacy solver overshot by ~0.1%); under the tax_only cap,
 * the tax pulled from the IRA <= allowance. Runs the growth engine AND the
 * standard engine (formula.ts), which also lacked the Dana Gibson tax_only fix.
 */
import { makeClient } from './factory';
import { Reporter } from './assertions';
import { runGrowthSimulation, runSimulation, createSimulationInput } from '../..';

const r = new Reporter();
const F = 'tax-funding';
const prod = {
  id: 'p', name: 'p', engine_preset: 'vesting-bonus-growth', category: 'growth',
  config: {
    bonus: { percentage: 16, type: 'vesting' },
    surrender: { years: 10, schedule: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] },
    fees: { annual_rider_fee: 0, fee_duration: 'surrender_period' },
    withdrawals: { penalty_free_percent: 10, year_1_rule: 'same', cumulative_withdrawal: false },
    other: { mva_applies: true },
  },
} as never;

const CONV = [
  { conversion_type: 'full_conversion' },
  { conversion_type: 'fixed_amount', fixed_conversion_amount: 30_000_000 },
  { conversion_type: 'optimized_amount', max_tax_rate: 24 },
  { conversion_type: 'partial_amount', target_partial_amount: 40_000_000, max_tax_rate: 24 },
] as const;

for (const engine of ['growth', 'standard'] as const)
for (const scope of ['tax_only', 'all_distributions'] as const)
  for (const respect of [true, false])
    for (const conv of CONV)
      for (const state of ['NJ', 'TX']) {
        const tag = `${F}/${engine}/${scope}/${respect ? 'cap' : 'nocap'}/${conv.conversion_type}/${state}`;
        const c = makeClient({
          age: 60, state, filing_status: 'single', qualified_account_value: 80_000_000, taxable_accounts: 0,
          tax_payment_source: 'from_ira', ssi_annual_amount: 0, end_age: 90, blueprint_type: 'vesting-bonus-growth',
          bonus_percent: 16, surrender_years: 10, surrender_schedule: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
          penalty_free_percent: 10, respect_penalty_free_limit: respect, penalty_free_scope: scope, ...conv,
        });
        const f = engine === 'growth'
          ? runGrowthSimulation(createSimulationInput(c, prod)).formula
          : runSimulation(createSimulationInput(c, null)).formula;
        let gap = 0;
        for (const y of f) {
          if (y.age >= 73) break;
          gap += (y.federalTax + y.stateTax) - ((y.taxesPaidFromIRA ?? 0) + (y.taxesPaidExternally ?? 0));
        }
        r.ran();
        if (Math.abs(gap) > 50_00) {
          r.record({ fixture: tag, scenario: 'formula', check: 'tax-booked-equals-tax-paid', actual: gap, note: `pre-RMD tax booked minus tax paid = $${Math.round(gap / 100)}` });
        }
        if (respect && scope === 'tax_only') {
          for (let i = 0; i < Math.min(10, f.length); i++) {
            const y = f[i];
            r.ran();
            // Growth: the tax_only allowance is on the whole contract (v85) —
            // Traditional + the in-annuity Roth (no external Roth here).
            // Standard: Traditional only.
            const base = (y.traditionalBOY ?? 0) + (engine === 'growth' && i > 0 ? f[i - 1].rothBalance : 0);
            const allowance = Math.round(base * 0.10);
            if ((y.taxesPaidFromIRA ?? 0) > allowance + 100) {
              r.record({ fixture: tag, scenario: 'formula', check: 'tax-only-cap', year: y.year, expected: allowance, actual: y.taxesPaidFromIRA });
            }
          }
        }
        if (respect && scope === 'all_distributions') {
          for (const y of f.slice(0, 10)) {
            r.ran();
            const allowance = Math.round((y.traditionalBOY ?? 0) * 0.10);
            if ((y.totalIRAWithdrawal ?? 0) > allowance + 100) {
              r.record({ fixture: tag, scenario: 'formula', check: 'strict-cap', year: y.year, expected: allowance, actual: y.totalIRAWithdrawal });
            }
          }
        }
      }

r.print('Conversion tax is fully funded; strict cap holds');
process.exit(r.breaches.length > 0 ? 1 : 0);
