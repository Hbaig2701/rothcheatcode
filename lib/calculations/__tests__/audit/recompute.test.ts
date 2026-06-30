/**
 * Phase 2 — Independent recomputation cross-check.
 *
 * Run: npx tsx lib/calculations/__tests__/audit/recompute.test.ts
 *
 * This re-derives the per-year tax quantities FROM SCRATCH (its own 2026 bracket
 * walk and its own SS-torpedo formula — NOT the engine's helpers) and diffs them
 * against the engine's reported fields. Phase 1 proves the numbers are internally
 * consistent; this proves they're actually CORRECT. A breach means the engine's
 * tax value disagrees with a hand-rolled second opinion.
 *
 * Independent constants (2026, cents) — cross-checked against the published IRS
 * figures, intentionally NOT imported from the engine so a bad table is caught.
 */

import type { Client } from '../../../types/client';
import type { YearlyResult } from '../../types';
import { makeClient, dispatch } from './factory';
import { Reporter } from './assertions';

type Filing = Client['filing_status'];

// 2026 ordinary brackets (cents). { upTo, rate }.
const BRACKETS: Record<string, { upTo: number; rate: number }[]> = {
  single: [
    { upTo: 1_192_500, rate: 10 }, { upTo: 4_847_500, rate: 12 }, { upTo: 10_335_000, rate: 22 },
    { upTo: 20_177_500, rate: 24 }, { upTo: 25_617_500, rate: 32 }, { upTo: 64_147_500, rate: 35 }, { upTo: Infinity, rate: 37 },
  ],
  married_filing_jointly: [
    { upTo: 2_385_000, rate: 10 }, { upTo: 9_695_000, rate: 12 }, { upTo: 20_670_000, rate: 22 },
    { upTo: 40_355_000, rate: 24 }, { upTo: 51_235_000, rate: 32 }, { upTo: 76_845_000, rate: 35 }, { upTo: Infinity, rate: 37 },
  ],
};
BRACKETS.married_filing_separately = [
  { upTo: 1_192_500, rate: 10 }, { upTo: 4_847_500, rate: 12 }, { upTo: 10_335_000, rate: 22 },
  { upTo: 20_177_500, rate: 24 }, { upTo: 25_617_500, rate: 32 }, { upTo: 38_422_500, rate: 35 }, { upTo: Infinity, rate: 37 },
];
BRACKETS.head_of_household = [
  { upTo: 1_700_000, rate: 10 }, { upTo: 6_475_000, rate: 12 }, { upTo: 10_335_000, rate: 22 },
  { upTo: 20_177_500, rate: 24 }, { upTo: 25_617_500, rate: 32 }, { upTo: 64_147_500, rate: 35 }, { upTo: Infinity, rate: 37 },
];

// SS provisional-income thresholds (cents), NOT inflation-adjusted.
const SS_THRESH: Record<string, [number, number]> = {
  single: [2_500_000, 3_400_000],
  married_filing_jointly: [3_200_000, 4_400_000],
  married_filing_separately: [0, 0],
  head_of_household: [2_500_000, 3_400_000],
};

// Federal brackets inflation-index forward at 3%/yr (SS thresholds do NOT — they
// are statutory and frozen). Replicated here independently so the federal-tax
// check is a true second-opinion bracket walk on the year-appropriate brackets.
const FED_INFLATION = 0.03;
function fedTax(taxableIncome: number, filing: Filing, year: number): number {
  if (taxableIncome <= 0) return 0;
  const f = Math.pow(1 + FED_INFLATION, Math.max(0, year - 2026));
  const br = BRACKETS[filing] ?? BRACKETS.single;
  let tax = 0, lower = 0;
  for (const b of br) {
    if (taxableIncome <= lower) break;
    const upTo = b.upTo === Infinity ? Infinity : Math.round((b.upTo * f) / 100) * 100;
    const amt = Math.min(taxableIncome, upTo) - lower;
    tax += (amt * b.rate) / 100;
    lower = upTo;
  }
  return Math.round(tax);
}

function taxableSS(ss: number, nonSSAgi: number, taxExempt: number, filing: Filing): number {
  const [lo, hi] = SS_THRESH[filing] ?? SS_THRESH.single;
  const provisional = nonSSAgi + taxExempt + ss / 2;
  if (provisional <= lo) return 0;
  if (provisional <= hi) return Math.round(Math.min((provisional - lo) * 0.5, ss * 0.5));
  const first = Math.min((hi - lo) * 0.5, ss * 0.5);
  return Math.round(Math.min((provisional - hi) * 0.85 + first, ss * 0.85));
}

const r = new Reporter();
const TOL = 100; // cents — allow $1 of rounding between two independent implementations

const fixtures: { name: string; client: Client }[] = [
  { name: 'single/TX/$30kSS/optimized', client: makeClient({ ssi_annual_amount: 3_000_000 }) },
  { name: 'single/MA/$25kSS/fixed/from_ira', client: makeClient({ state: 'MA', state_tax_rate: 5, ssi_annual_amount: 2_500_000, conversion_type: 'fixed_amount', fixed_conversion_amount: 5_000_000, tax_payment_source: 'from_ira' }) },
  { name: 'MFJ/WI/dual-SS/optimized', client: makeClient({ filing_status: 'married_filing_jointly', spouse_age: 62, state: 'WI', state_tax_rate: 7.65, ssi_annual_amount: 4_000_000, spouse_ssi_payout_age: 67, spouse_ssi_annual_amount: 3_000_000 }) },
  { name: 'MFJ/TX/highIncome/optimized', client: makeClient({ filing_status: 'married_filing_jointly', spouse_age: 64, qualified_account_value: 300_000_000, ssi_annual_amount: 5_000_000, spouse_ssi_annual_amount: 4_000_000 }) },
];

for (const fx of fixtures) {
  const { baseline, formula } = dispatch(fx.client);
  for (const [scenario, years] of [['baseline', baseline], ['formula', formula]] as const) {
    for (const y of years as YearlyResult[]) {
      if (y.agi == null || y.taxableIncome == null || y.standardDeduction == null) continue;

      // (1) taxable income identity
      const tiExpected = Math.max(0, y.agi - y.standardDeduction);
      r.ran();
      if (Math.abs(tiExpected - y.taxableIncome) > TOL) {
        r.record({ fixture: fx.name, scenario, check: 'recompute:taxableIncome', year: y.year, age: y.age, field: 'taxableIncome', expected: tiExpected, actual: y.taxableIncome, delta: y.taxableIncome - tiExpected, note: 'taxableIncome != max(0, agi − stdDeduction)' });
      }

      // (2) independent federal bracket walk vs engine federalTax.
      // Skip rows with a tax-credit draw (federalTax is post-credit there).
      if (!(y.taxCreditApplied && y.taxCreditApplied > 0)) {
        const fedExpected = fedTax(y.taxableIncome, fx.client.filing_status, y.year);
        r.ran();
        if (Math.abs(fedExpected - y.federalTax) > TOL) {
          r.record({ fixture: fx.name, scenario, check: 'recompute:federalTax', year: y.year, age: y.age, field: 'federalTax', expected: fedExpected, actual: y.federalTax, delta: y.federalTax - fedExpected, note: 'engine federalTax != independent bracket walk on its own taxableIncome' });
        }
      }

      // (3) independent SS torpedo vs engine taxableSS.
      if (y.ssIncome > 0 && y.taxableSS != null) {
        const nonSSAgi = y.agi - y.taxableSS; // engine agi includes taxable SS
        const ssExpected = taxableSS(y.ssIncome, nonSSAgi, fx.client.tax_exempt_non_ssi ?? 0, fx.client.filing_status);
        r.ran();
        if (Math.abs(ssExpected - y.taxableSS) > TOL) {
          r.record({ fixture: fx.name, scenario, check: 'recompute:taxableSS', year: y.year, age: y.age, field: 'taxableSS', expected: ssExpected, actual: y.taxableSS, delta: y.taxableSS - ssExpected, note: 'engine taxable SS != independent provisional-income formula' });
        }
      }
    }
  }
}

r.print('Phase 2 — Independent recomputation');
process.exit(r.breaches.length > 0 ? 1 : 0);
