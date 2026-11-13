/**
 * The client's taxable brokerage grows under EVERY rmd_treatment.
 *
 * Run: npx tsx lib/calculations/__tests__/audit/taxable-growth-modes.test.ts
 *
 * rmd_treatment decides where forced-RMD cash goes (reinvested / sits in cash /
 * spent). Before v88 all three Roth engines also gated the brokerage's growth
 * on 'reinvested', so 'cash' and 'spent' froze the client's own taxable account
 * at 0% on both sides — conversion tax paid from it cost no lost growth and the
 * strategy looked far better than it is (Mike Owens / Vince Haggard, Nov 2026:
 * +$1.44M "Sits in Cash" vs +$150K "Reinvested" on the same client).
 *
 * What is locked here, for the standard (formula.ts) and growth engines:
 *  1. Year 1 of the do-nothing baseline (no RMD, no conversion, under 65) grows
 *     the brokerage by exactly the comparison rate in every mode.
 *  2. Before RMDs start, the mode cannot matter: baseline and strategy taxable
 *     balances are identical across reinvested / cash / spent.
 *  3. After RMDs start, reinvested > cash > spent on the baseline (cash keeps
 *     the RMD but not its growth; spent keeps neither) — and cash still earns
 *     on the original brokerage, so it beats "brokerage frozen + RMDs piled up".
 */
import type { Client as ClientType } from '../../../types/client';
import { makeClient, dispatch } from './factory';
import { Reporter } from './assertions';

const r = new Reporter();
const F = 'taxable-growth-modes';
const TAXABLE = 20_000_000; // $200K, in cents
const RATE = 7;

const BASE: Partial<ClientType> = {
  age: 60,
  end_age: 90,
  qualified_account_value: 50_000_000,
  taxable_accounts: TAXABLE,
  rate_of_return: RATE,
  growth_rate: RATE,
  baseline_comparison_rate: RATE,
  post_contract_rate: RATE,
  max_tax_rate: 24,
  conversion_type: 'optimized_amount',
  tax_payment_source: 'from_taxable',
  heir_tax_rate: 35,
};

const MODES = ['reinvested', 'cash', 'spent'] as const;

for (const blueprint_type of ['fia', 'high-bonus-long-term-growth'] as const) {
  const runs = Object.fromEntries(MODES.map((m) => [m, dispatch(makeClient({ ...BASE, blueprint_type, rmd_treatment: m }))]));
  const fx = `${F}:${runs.reinvested.engine}`;

  // 1. Year-1 baseline growth is exactly the comparison rate, every mode.
  for (const m of MODES) {
    r.ran();
    const expected = Math.round(TAXABLE * (1 + RATE / 100));
    const actual = runs[m].baseline[0].taxableBalance;
    if (actual !== expected) r.record({ fixture: fx, scenario: 'baseline', check: `year-1 growth (${m})`, expected, actual });
  }

  // 2. Before the first RMD the mode is irrelevant, on both sides.
  const firstRmd = runs.reinvested.baseline.findIndex((y) => (y.rmdAmount ?? 0) > 0);
  r.ran();
  if (firstRmd <= 0) r.record({ fixture: fx, scenario: 'baseline', check: 'fixture reaches RMD age', note: `firstRmd=${firstRmd}` });
  for (const side of ['baseline', 'formula'] as const) {
    for (const m of ['cash', 'spent'] as const) {
      for (let i = 0; i < firstRmd; i++) {
        r.ran();
        const a = runs.reinvested[side][i].taxableBalance;
        const b = runs[m][side][i].taxableBalance;
        if (a !== b) {
          r.record({ fixture: fx, scenario: side, check: `pre-RMD taxable equal (${m}, age ${runs[m][side][i].age})`, expected: a, actual: b });
          break;
        }
      }
    }
  }

  // 3. After RMDs: reinvested > cash > spent, and cash keeps growing the brokerage.
  const last = (m: typeof MODES[number]) => runs[m].baseline.at(-1)!.taxableBalance;
  r.ran();
  if (!(last('reinvested') > last('cash') && last('cash') > last('spent'))) {
    r.record({ fixture: fx, scenario: 'baseline', check: 'reinvested > cash > spent', note: `${last('reinvested')} / ${last('cash')} / ${last('spent')}` });
  }
  const pre = runs.cash.baseline[firstRmd - 1].taxableBalance;
  const rmdCash = runs.cash.baseline.slice(firstRmd).reduce((s, y) => s + (y.rmdAmount ?? 0), 0);
  r.ran();
  // Brokerage frozen at its pre-RMD value plus every gross RMD is an upper bound
  // on the old behaviour; growing the brokerage must beat it despite RMD tax.
  if (!(last('cash') > pre * Math.pow(1 + RATE / 100, runs.cash.baseline.length - firstRmd) * 0.99)) {
    r.record({ fixture: fx, scenario: 'baseline', check: 'cash mode still grows the brokerage', note: `final ${last('cash')}, pre-RMD ${pre}, rmd ${rmdCash}` });
  }
}

r.print('Taxable brokerage grows under every RMD treatment');
process.exit(r.breaches.length > 0 ? 1 : 0);
