/**
 * Correctness probes — round 2 (standard deduction, SS COLA, IRMAA amount +
 * 2-year lookback). Independent re-derivations vs engine fields.
 *
 * Run: npx tsx lib/calculations/__tests__/audit/correctness-extra.test.ts
 */

import type { Client } from '../../../types/client';
import { makeClient, dispatch } from './factory';
import { Reporter } from './assertions';
import { getStandardDeduction } from '../../../data/standard-deductions';

const r = new Reporter();
const TOL = 100;

// ---------------------------------------------------------------------------
// (1) Standard deduction — independent: base (2026) × 1.03^(year-2026) rounded
// to $100, + senior bonus ($2,000 single / $1,600 per 65+ spouse married).
// ---------------------------------------------------------------------------
const BASE: Record<string, number> = { single: 1_610_000, married_filing_jointly: 3_220_000, married_filing_separately: 1_610_000, head_of_household: 2_415_000 };
function dedIndependent(status: string, age: number, spouseAge: number | undefined, year: number): number {
  // Both the base deduction AND the senior additional deduction are inflation-
  // indexed 3%/yr (the IRS adjusts both annually), rounded to $100.
  const infl = year > 2026 ? Math.pow(1.03, year - 2026) : 1;
  const round100 = (c: number) => (year > 2026 ? Math.round((c * infl) / 100) * 100 : c);
  const base = round100(BASE[status] ?? BASE.single);
  const seniorSingle = round100(200_000);
  const seniorMarried = round100(160_000);
  let bonus = 0;
  const married = status === 'married_filing_jointly' || status === 'married_filing_separately';
  if (married) {
    if (age >= 65) bonus += seniorMarried;
    if (spouseAge != null && spouseAge >= 65) bonus += seniorMarried;
  } else if (age >= 65) bonus += seniorSingle;
  return base + bonus;
}
for (const status of ['single', 'married_filing_jointly', 'head_of_household'] as const) {
  for (const age of [62, 65, 70]) {
    for (const spouseAge of [undefined, 60, 66]) {
      for (const year of [2026, 2031, 2040]) {
        r.ran();
        const eng = getStandardDeduction(status, age, spouseAge, year);
        const ind = dedIndependent(status, age, spouseAge, year);
        if (Math.abs(eng - ind) > TOL) {
          r.record({ fixture: `${status}/age${age}/sp${spouseAge}/${year}`, scenario: 'baseline', check: 'std-deduction', expected: ind, actual: eng, delta: eng - ind });
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// (2) SS COLA — engine ssIncome must equal initial × 1.02^(years collecting).
// ---------------------------------------------------------------------------
{
  const init = 4_000_000, payAge = 67;
  const c: Client = makeClient({ conversion_type: 'no_conversion', age: 64, end_age: 90, ssi_payout_age: payAge, ssi_annual_amount: init, post_contract_rate: 6 });
  const { baseline } = dispatch(c, 2026);
  for (const y of baseline) {
    if (y.age < payAge) {
      r.ran();
      if ((y.ssIncome ?? 0) > TOL) r.record({ fixture: 'ss-cola', scenario: 'baseline', check: 'ss-before-payout', year: y.year, age: y.age, actual: y.ssIncome, note: 'SS paid before payout age' });
      continue;
    }
    const yearsCollecting = y.age - payAge;
    const expected = Math.round(init * Math.pow(1.02, yearsCollecting));
    r.ran();
    if (Math.abs(expected - y.ssIncome) > TOL) {
      r.record({ fixture: 'ss-cola', scenario: 'baseline', check: 'ss-cola', year: y.year, age: y.age, field: 'ssIncome', expected, actual: y.ssIncome, delta: y.ssIncome - expected });
    }
  }
}

// ---------------------------------------------------------------------------
// (3) IRMAA — single filer surcharge amount == tier monthly × 12, AND the
// 2-year lookback: surcharge at year T reflects MAGI at year T−2.
// 2026 single thresholds (cents) and per-person monthly surcharge.
// ---------------------------------------------------------------------------
// Actual CMS 2026 figures (corrected v71 — Lori Avant ticket). Must mirror
// lib/data/irmaa-brackets.ts exactly, including its 2.5% threshold inflation.
const IRMAA_SINGLE: { upTo: number; monthly: number }[] = [
  { upTo: 10_900_000, monthly: 0 }, { upTo: 13_700_000, monthly: 8_120 }, { upTo: 17_100_000, monthly: 20_290 },
  { upTo: 20_500_000, monthly: 32_460 }, { upTo: 50_000_000, monthly: 44_630 }, { upTo: Infinity, monthly: 48_700 },
];
function irmaaThresholdInflate(upTo: number, year: number) {
  return upTo === Infinity ? Infinity : Math.round((upTo * Math.pow(1.025, Math.max(0, year - 2026))) / 100) * 100;
}
function expectedIrmaaSingle(magi: number, year: number): number {
  for (const t of IRMAA_SINGLE) {
    if (magi <= irmaaThresholdInflate(t.upTo, year)) return t.monthly * 12;
  }
  return 0;
}
{
  // High, lumpy income to move through tiers; single, age 64→90.
  const c: Client = makeClient({ filing_status: 'single', age: 64, end_age: 90, qualified_account_value: 350_000_000, conversion_type: 'optimized_amount', max_tax_rate: 35, ssi_annual_amount: 3_000_000, taxable_accounts: 50_000_000, tax_payment_source: 'from_taxable', post_contract_rate: 6 });
  const { baseline } = dispatch(c, 2026);
  const byYear = new Map(baseline.map((y) => [y.year, y]));
  let lookbackTested = 0;
  for (const y of baseline) {
    if (y.age < 65) continue;
    // (3a) amount consistency with the engine's OWN tier classification:
    // surcharge must be a valid single-tier amount for SOME tier.
    const validAmounts = IRMAA_SINGLE.map((t) => t.monthly * 12);
    r.ran();
    if (!validAmounts.some((a) => Math.abs(a - (y.irmaaSurcharge ?? 0)) <= TOL)) {
      r.record({ fixture: 'irmaa-amount', scenario: 'baseline', check: 'irmaa-valid-tier-amount', year: y.year, age: y.age, actual: y.irmaaSurcharge, note: 'surcharge is not any single-filer tier amount' });
    }
    // (3b) 2-year lookback: surcharge at T should match the tier for MAGI at T−2.
    const prior = byYear.get(y.year - 2);
    if (prior && prior.magi != null && prior.age >= 0) {
      const exp = expectedIrmaaSingle(prior.magi, y.year);
      r.ran();
      lookbackTested++;
      if (Math.abs(exp - (y.irmaaSurcharge ?? 0)) > TOL) {
        r.record({ fixture: 'irmaa-lookback', scenario: 'baseline', check: 'irmaa-2yr-lookback', year: y.year, age: y.age, field: 'irmaaSurcharge', expected: exp, actual: y.irmaaSurcharge, delta: (y.irmaaSurcharge ?? 0) - exp, note: `expected from MAGI@${y.year - 2}=${((prior.magi) / 100).toFixed(0)}` });
      }
    }
  }
  console.log(`irmaa lookback rows tested: ${lookbackTested}`);
}

r.print('Correctness round 2 — deduction / SS COLA / IRMAA');
process.exit(r.breaches.length > 0 ? 1 : 0);
