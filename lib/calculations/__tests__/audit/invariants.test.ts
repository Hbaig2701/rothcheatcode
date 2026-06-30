/**
 * Phase 1 — Invariants. Properties that must hold for ALL inputs, checked
 * per-year across a grid of fixtures spanning every engine and conversion mode.
 *
 * Run: npx tsx lib/calculations/__tests__/audit/invariants.test.ts
 *
 * A breach here is a real accuracy bug (phantom money, broken symmetry, a
 * total that doesn't equal the sum of its parts). Investigate — do not silence.
 */

import type { Client } from '../../../types/client';
import { makeClient, dispatch } from './factory';
import {
  Reporter,
  checkFinite,
  checkNonNegative,
  checkTraditionalTieOut,
  checkSymmetry,
  checkFullConversionDrains,
  checkPartialCap,
  checkTotalTaxComposition,
  checkNetWorthComposition,
} from './assertions';

interface Fixture {
  name: string;
  client: Client;
  symmetric?: boolean; // expect baseline ≡ formula
  fullConversion?: boolean;
  partialCap?: number;
}

const fixtures: Fixture[] = [
  // --- standard engine, conversion modes ---
  {
    name: 'std/optimized/single/TX',
    client: makeClient({ conversion_type: 'optimized_amount' }),
  },
  {
    // Symmetry only holds when the strategy and baseline credit at the same
    // rate every year — so align post_contract_rate with baseline/rate_of_return
    // and zero the bonus. (A divergent post_contract_rate is a real product
    // feature, not a bug: after surrender the FIA credits its post-contract
    // rate while the "do nothing" baseline keeps the market rate.)
    name: 'std/no-conversion/single/TX (symmetry)',
    client: makeClient({ conversion_type: 'no_conversion', bonus_percent: 0, post_contract_rate: 6, baseline_comparison_rate: 6, rate_of_return: 6 }),
    symmetric: true,
  },
  {
    name: 'std/full/MFJ/WI',
    client: makeClient({
      filing_status: 'married_filing_jointly', spouse_age: 60, state: 'WI', state_tax_rate: 7.65,
      conversion_type: 'full_conversion', tax_payment_source: 'from_ira', age: 60, end_age: 95,
    }),
    fullConversion: true,
  },
  {
    name: 'std/full/single/TX/young (drains before RMD)',
    client: makeClient({ age: 55, end_age: 95, conversion_type: 'full_conversion', tax_payment_source: 'from_ira' }),
    fullConversion: true,
  },
  {
    name: 'std/fixed-50k/single/MA',
    client: makeClient({
      state: 'MA', state_tax_rate: 5, conversion_type: 'fixed_amount', fixed_conversion_amount: 5_000_000,
      ssi_annual_amount: 2_500_000, tax_payment_source: 'from_ira',
    }),
  },
  {
    name: 'std/partial-200k/single/TX',
    client: makeClient({ conversion_type: 'partial_amount', target_partial_amount: 20_000_000 }),
    partialCap: 20_000_000,
  },
  {
    name: 'std/optimized/MFJ/CA/dual-SS',
    client: makeClient({
      filing_status: 'married_filing_jointly', spouse_age: 62, state: 'CA',
      ssi_annual_amount: 4_000_000, spouse_ssi_payout_age: 67, spouse_ssi_annual_amount: 3_000_000,
    }),
  },
  // --- growth engine ---
  {
    name: 'growth/high-bonus-long-term/optimized',
    client: makeClient({ blueprint_type: 'high-bonus-long-term-growth', bonus_percent: 22, surrender_years: 15 }),
  },
  {
    // Growth product WITHOUT a rider fee (short-term-cap-growth has none).
    // High-bonus products charge a 0.95% rider fee the strategy pays but the
    // baseline does not, which legitimately breaks symmetry — so symmetry is
    // only asserted on a no-rider, no-bonus product with aligned rates.
    name: 'growth/short-term-cap/no-conversion (symmetry)',
    client: makeClient({ blueprint_type: 'short-term-cap-growth', conversion_type: 'no_conversion', bonus_percent: 0, post_contract_rate: 6, baseline_comparison_rate: 6, rate_of_return: 6 }),
    symmetric: true,
  },
  // --- GI engine ---
  {
    name: 'gi/generic-income/individual',
    client: makeClient({ blueprint_type: 'generic-income', income_start_age: 72, gi_conversion_years: 5 }),
  },
  {
    name: 'gi/compound-rollup/joint',
    client: makeClient({
      blueprint_type: 'compound-rollup-income', payout_type: 'joint',
      filing_status: 'married_filing_jointly', spouse_age: 62, income_start_age: 72,
    }),
  },
];

const r = new Reporter();

for (const fx of fixtures) {
  let out;
  try {
    out = dispatch(fx.client);
  } catch (e) {
    r.record({ fixture: fx.name, scenario: 'formula', check: 'engine-threw', note: (e as Error).message });
    continue;
  }
  const { baseline, formula } = out;

  for (const [scenario, years] of [['baseline', baseline], ['formula', formula]] as const) {
    checkFinite(r, fx.name, scenario, years);
    checkNonNegative(r, fx.name, scenario, years);
    checkNetWorthComposition(r, fx.name, scenario, years);
    checkTotalTaxComposition(r, fx.name, scenario, years);
    checkTraditionalTieOut(r, fx.name, scenario, years);
  }

  if (fx.symmetric) checkSymmetry(r, fx.name, baseline, formula);
  if (fx.fullConversion) checkFullConversionDrains(r, fx.name, formula);
  if (fx.partialCap != null) checkPartialCap(r, fx.name, formula, fx.partialCap);
}

r.print('Phase 1 — Invariants');
process.exit(r.breaches.length > 0 ? 1 : 0);
