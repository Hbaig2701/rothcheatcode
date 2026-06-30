/**
 * Phase 5 — Combinatorial stress sweep.
 *
 * Run: npx tsx lib/calculations/__tests__/audit/stress-sweep.test.ts
 *
 * Generates a large grid of input combinations (product × conversion mode ×
 * filing × state × tax-source × penalty-free × RMD treatment) and runs the
 * core invariants on each. Surfaces interaction bugs no single hand-written
 * fixture would hit. Coverage is printed (never silently capped).
 */

import type { Client } from '../../../types/client';
import { makeClient, dispatch, engineFor } from './factory';
import {
  Reporter,
  checkFinite,
  checkNonNegative,
  checkNetWorthComposition,
  checkTotalTaxComposition,
  checkTraditionalTieOut,
  checkFullConversionDrains,
} from './assertions';

const products: Client['blueprint_type'][] = ['fia', 'high-bonus-long-term-growth', 'high-bonus-medium-term-growth', 'vesting-bonus-growth', 'generic-income', 'compound-rollup-income'];
const conversions = ['optimized_amount', 'fixed_amount', 'full_conversion', 'partial_amount', 'no_conversion'] as const;
const filings = ['single', 'married_filing_jointly'] as const;
const states: [string, number | null][] = [['TX', null], ['CA', null], ['MA', 5], ['WI', 7.65]];
const paySources = ['from_taxable', 'from_ira'] as const;
const rmdTreatments = ['reinvested', 'spent', 'cash'] as const;

const r = new Reporter();
let combos = 0;
let threw = 0;

for (const product of products) {
  for (const conversion_type of conversions) {
    for (const filing_status of filings) {
      for (const [state, state_tax_rate] of states) {
        for (const tax_payment_source of paySources) {
          for (const rmd_treatment of rmdTreatments) {
            combos++;
            const client = makeClient({
              blueprint_type: product,
              conversion_type,
              filing_status,
              spouse_age: filing_status === 'married_filing_jointly' ? 60 : null,
              spouse_ssi_payout_age: filing_status === 'married_filing_jointly' ? 67 : null,
              spouse_ssi_annual_amount: filing_status === 'married_filing_jointly' ? 3_000_000 : null,
              state,
              state_tax_rate,
              tax_payment_source,
              rmd_treatment,
              fixed_conversion_amount: conversion_type === 'fixed_amount' ? 4_000_000 : null,
              target_partial_amount: conversion_type === 'partial_amount' ? 15_000_000 : null,
              ssi_annual_amount: 3_000_000,
              age: 63,
              end_age: 92,
              income_start_age: 72,
            });
            const name = `${product}/${conversion_type}/${filing_status}/${state}/${tax_payment_source}/${rmd_treatment}`;
            let out;
            try {
              out = dispatch(client, 2026);
            } catch (e) {
              threw++;
              r.record({ fixture: name, scenario: 'formula', check: 'engine-threw', note: (e as Error).message });
              continue;
            }
            for (const [scenario, years] of [['baseline', out.baseline], ['formula', out.formula]] as const) {
              checkFinite(r, name, scenario, years);
              checkNonNegative(r, name, scenario, years);
              checkNetWorthComposition(r, name, scenario, years);
              checkTotalTaxComposition(r, name, scenario, years);
              // tie-out is only well-defined for non-GI engines (GI phases move
              // money between the annuity sub-accounts, not the IRA flow fields).
              if (engineFor(client) !== 'gi') checkTraditionalTieOut(r, name, scenario, years);
            }
            if (conversion_type === 'full_conversion' && engineFor(client) !== 'gi') {
              checkFullConversionDrains(r, name, out.formula);
            }
          }
        }
      }
    }
  }
}

console.log(`swept ${combos} input combinations (${threw} threw)`);
r.print('Phase 5 — Combinatorial stress sweep');
process.exit(r.breaches.length > 0 ? 1 : 0);
