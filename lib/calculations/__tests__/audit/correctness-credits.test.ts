/**
 * Correctness probes — round 3 (tax-credit carryforward, conversion gross-up
 * identity at RMD age). Independent re-derivations vs engine fields.
 *
 * Run: npx tsx lib/calculations/__tests__/audit/correctness-credits.test.ts
 */

import type { Client } from '../../../types/client';
import { makeClient, dispatch } from './factory';
import { Reporter } from './assertions';

const r = new Reporter();
const TOL = 100;

type Filing = Client['filing_status'];
const BRACKETS: Record<string, { upTo: number; rate: number }[]> = {
  single: [{ upTo: 1_192_500, rate: 10 }, { upTo: 4_847_500, rate: 12 }, { upTo: 10_335_000, rate: 22 }, { upTo: 20_177_500, rate: 24 }, { upTo: 25_617_500, rate: 32 }, { upTo: 64_147_500, rate: 35 }, { upTo: Infinity, rate: 37 }],
  married_filing_jointly: [{ upTo: 2_385_000, rate: 10 }, { upTo: 9_695_000, rate: 12 }, { upTo: 20_670_000, rate: 22 }, { upTo: 40_355_000, rate: 24 }, { upTo: 51_235_000, rate: 32 }, { upTo: 76_845_000, rate: 35 }, { upTo: Infinity, rate: 37 }],
};
function fedTax(ti: number, filing: Filing, year: number): number {
  if (ti <= 0) return 0;
  const f = Math.pow(1.03, Math.max(0, year - 2026));
  const br = BRACKETS[filing] ?? BRACKETS.single;
  let tax = 0, lower = 0;
  for (const b of br) {
    if (ti <= lower) break;
    const upTo = b.upTo === Infinity ? Infinity : Math.round((b.upTo * f) / 100) * 100;
    tax += (Math.min(ti, upTo) - lower) * b.rate / 100;
    lower = upTo;
  }
  return Math.round(tax);
}

// ---------------------------------------------------------------------------
// (1) Tax-credit carryforward. Pool reduces federal tax dollar-for-dollar,
// carries forward, never goes negative, never exceeds the pool.
// Independent pre-credit fed tax = bracket walk on the engine's taxableIncome.
// ---------------------------------------------------------------------------
{
  const POOL = 5_000_000; // $50k credit pool
  const c: Client = makeClient({ filing_status: 'single', age: 70, end_age: 90, state: 'TX', tax_credits: POOL, conversion_type: 'fixed_amount', fixed_conversion_amount: 6_000_000, tax_payment_source: 'from_taxable', taxable_accounts: 20_000_000, ssi_annual_amount: 3_000_000, post_contract_rate: 6 });
  const { formula } = dispatch(c, 2026);
  let pool = POOL, totalApplied = 0;
  for (const y of formula) {
    if (y.taxableIncome == null) continue;
    const preFed = fedTax(y.taxableIncome, 'single', y.year);
    const expectApplied = Math.min(pool, preFed);
    const applied = y.taxCreditApplied ?? 0;
    // engine's applied credit should equal min(remaining pool, pre-credit fed tax)
    r.ran();
    if (Math.abs(applied - expectApplied) > TOL) {
      r.record({ fixture: 'tax-credit', scenario: 'formula', check: 'credit-applied', year: y.year, age: y.age, field: 'taxCreditApplied', expected: expectApplied, actual: applied, delta: applied - expectApplied, note: `pool ${(pool / 100).toFixed(0)} preFed ${(preFed / 100).toFixed(0)}` });
    }
    // post-credit federal tax should be preFed − applied
    r.ran();
    if (Math.abs((preFed - applied) - y.federalTax) > TOL) {
      r.record({ fixture: 'tax-credit', scenario: 'formula', check: 'credit-net-fed', year: y.year, age: y.age, field: 'federalTax', expected: preFed - applied, actual: y.federalTax, delta: y.federalTax - (preFed - applied) });
    }
    pool = Math.max(0, pool - applied);
    totalApplied += applied;
    r.ran();
    if (applied < -TOL || applied > preFed + TOL) {
      r.record({ fixture: 'tax-credit', scenario: 'formula', check: 'credit-bounds', year: y.year, age: y.age, actual: applied, note: 'applied credit outside [0, preFedTax]' });
    }
  }
  r.ran();
  if (totalApplied > POOL + TOL) {
    r.record({ fixture: 'tax-credit', scenario: 'formula', check: 'credit-pool-cap', expected: POOL, actual: totalApplied, delta: totalApplied - POOL, note: 'lifetime credits applied exceed the pool' });
  }
  console.log(`tax-credit: pool ${(POOL / 100).toFixed(0)}, lifetime applied ${(totalApplied / 100).toFixed(0)}, remaining ${(pool / 100).toFixed(0)}`);
}

// ---------------------------------------------------------------------------
// (2) Conversion gross-up identity at RMD age (from_ira). The IRS-visible IRA
// distribution = conversion + the EXTRA tax pull beyond the after-tax RMD.
// totalIRAWithdrawal must equal conversion + extraPull, and the conversion tax
// funded from the IRA must be covered by RMD-first then extra pull.
// ---------------------------------------------------------------------------
for (const ct of ['optimized_amount', 'fixed_amount', 'full_conversion'] as const) {
  const c: Client = makeClient({ filing_status: 'single', age: 70, end_age: 90, state: 'MA', state_tax_rate: 5, conversion_type: ct, fixed_conversion_amount: ct === 'fixed_amount' ? 5_000_000 : null, tax_payment_source: 'from_ira', taxable_accounts: 0, ssi_annual_amount: 3_000_000, qualified_account_value: 150_000_000, post_contract_rate: 6 });
  const { formula } = dispatch(c, 2026);
  for (const y of formula) {
    if ((y.conversionAmount ?? 0) <= 0 || (y.rmdAmount ?? 0) <= 0) continue;
    const tiw = y.totalIRAWithdrawal ?? 0;
    const conv = y.conversionAmount ?? 0;
    const rmd = y.rmdAmount ?? 0;
    const taxFromIra = y.taxesPaidFromIRA ?? 0;
    // totalIRAWithdrawal = conversion + RMD + extraPull, where extraPull =
    // max(0, conversionTaxFromIRA − afterTaxRMD). The RMD funds the conversion
    // tax FIRST (v64), so: conv+RMD ≤ tiw ≤ conv+RMD+tax. The lower bound holds
    // when the RMD fully funds the tax (extraPull 0); the upper when the RMD
    // funds none. A tiw OUTSIDE this band means the RMD-funds-tax accounting is
    // broken (double-pull or under-pull).
    r.ran();
    if (tiw < conv + rmd - TOL) {
      r.record({ fixture: `grossup/${ct}`, scenario: 'formula', check: 'tiw-ge-conv-plus-rmd', year: y.year, age: y.age, expected: conv + rmd, actual: tiw, delta: tiw - (conv + rmd), note: 'totalIRAWithdrawal below conversion + RMD' });
    }
    r.ran();
    if (tiw > conv + rmd + taxFromIra + TOL) {
      r.record({ fixture: `grossup/${ct}`, scenario: 'formula', check: 'tiw-le-conv-rmd-tax', year: y.year, age: y.age, expected: conv + rmd + taxFromIra, actual: tiw, delta: tiw - (conv + rmd + taxFromIra), note: 'totalIRAWithdrawal exceeds conversion + RMD + tax (double-pull)' });
    }
  }
}

r.print('Correctness round 3 — tax credits / gross-up identity');
process.exit(r.breaches.length > 0 ? 1 : 0);
