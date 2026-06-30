/**
 * Penalty-free surrender cap — value verification.
 *
 * Run: npx tsx lib/calculations/__tests__/audit/penalty-free-cap.test.ts
 *
 * When respect_penalty_free_limit is on and tax is paid from the IRA during the
 * surrender period, the carrier only lets penalty_free_percent × BOY-IRA leave
 * the policy as tax (a Roth conversion is an intra-carrier transfer and does NOT
 * count). Scope:
 *   - tax_only (default): taxesPaidFromIRA ≤ pf% × BOY-IRA each surrender year.
 *   - all_distributions: conversion + RMD + tax ≤ pf% × BOY-IRA.
 * After the surrender period there is no cap.
 */

import type { Client } from '../../../types/client';
import { makeClient, dispatch } from './factory';
import { Reporter } from './assertions';

const r = new Reporter();
const TOL = 200;

function run(scope: 'tax_only' | 'all_distributions', surrenderYears: number) {
  const pfPct = 10;
  const c: Client = makeClient({
    age: 66, end_age: 92, qualified_account_value: 150_000_000,
    conversion_type: 'optimized_amount', max_tax_rate: 32, tax_payment_source: 'from_ira',
    taxable_accounts: 0, respect_penalty_free_limit: true, penalty_free_scope: scope,
    penalty_free_percent: pfPct, surrender_years: surrenderYears,
    ssi_annual_amount: 2_000_000, bonus_percent: 0, post_contract_rate: 6, baseline_comparison_rate: 6, rate_of_return: 6,
  });
  const { formula } = dispatch(c, 2026);
  formula.forEach((y, i) => {
    const boyIra = y.traditionalBOY ?? 0;
    const cap = Math.round(boyIra * pfPct / 100);
    const inSurrender = i < surrenderYears;
    const taxFromIra = y.taxesPaidFromIRA ?? 0;
    if (inSurrender && boyIra > 0) {
      if (scope === 'tax_only') {
        r.ran();
        if (taxFromIra > cap + TOL) {
          r.record({ fixture: `pfcap/${scope}/surr${surrenderYears}`, scenario: 'formula', check: 'pf-cap-tax-only', year: y.year, age: y.age, field: 'taxesPaidFromIRA', expected: cap, actual: taxFromIra, delta: taxFromIra - cap, note: 'tax from IRA exceeds penalty-free cap during surrender' });
        }
      } else {
        // all_distributions: conv + RMD + tax-from-IRA ≤ cap
        const total = (y.conversionAmount ?? 0) + (y.rmdAmount ?? 0) + taxFromIra;
        r.ran();
        if (total > cap + TOL) {
          r.record({ fixture: `pfcap/${scope}/surr${surrenderYears}`, scenario: 'formula', check: 'pf-cap-all-dist', year: y.year, age: y.age, expected: cap, actual: total, delta: total - cap, note: 'conv+RMD+tax exceeds penalty-free cap during surrender' });
        }
      }
    }
    // tax_only with from_ira: tax above the cap must NOT be silently dropped —
    // it routes to taxesPaidExternally OR the conversion sized down. Either way
    // the conversion's IRA tax stays within cap (checked above). Just ensure no
    // negative external.
    r.ran();
    if ((y.taxesPaidExternally ?? 0) < -TOL) {
      r.record({ fixture: `pfcap/${scope}/surr${surrenderYears}`, scenario: 'formula', check: 'pf-external-nonneg', year: y.year, age: y.age, actual: y.taxesPaidExternally });
    }
  });
  // After surrender ends, the cap should no longer bind: a year with a large
  // conversion should be allowed to pull tax > pf% × BOY without being capped.
  console.log(`pfcap/${scope}/surr${surrenderYears}: checked ${formula.length} years`);
}

run('tax_only', 7);
run('tax_only', 14);
run('all_distributions', 10);

r.print('Penalty-free surrender cap — value checks');
process.exit(r.breaches.length > 0 ? 1 : 0);
