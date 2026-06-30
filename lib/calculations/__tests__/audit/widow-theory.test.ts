/**
 * Widow-penalty module — independent verification + theory.
 *
 * Run: npx tsx lib/calculations/__tests__/audit/widow-theory.test.ts
 *
 * calculateWidowTaxImpact compares MFJ vs single filing on the survivor's
 * income. Theory: for the same income, the single tax must be ≥ the married tax
 * (the "widow penalty" — tighter brackets + half the standard deduction), and
 * the bracket can only stay or jump up. Independently re-derive both taxes.
 */

import { calculateWidowTaxImpact } from '../../analysis/widow-penalty';
import { Reporter } from './assertions';

const r = new Reporter();
const TOL = 100;

// Independent 2026 brackets (inflation-indexed 3%/yr) + standard deduction.
const BR: Record<string, { upTo: number; rate: number }[]> = {
  single: [{ upTo: 1_192_500, rate: 10 }, { upTo: 4_847_500, rate: 12 }, { upTo: 10_335_000, rate: 22 }, { upTo: 20_177_500, rate: 24 }, { upTo: 25_617_500, rate: 32 }, { upTo: 64_147_500, rate: 35 }, { upTo: Infinity, rate: 37 }],
  married_filing_jointly: [{ upTo: 2_385_000, rate: 10 }, { upTo: 9_695_000, rate: 12 }, { upTo: 20_670_000, rate: 22 }, { upTo: 40_355_000, rate: 24 }, { upTo: 51_235_000, rate: 32 }, { upTo: 76_845_000, rate: 35 }, { upTo: Infinity, rate: 37 }],
};
const DED: Record<string, number> = { single: 1_610_000, married_filing_jointly: 3_220_000 };
function fed(ti: number, f: string, year: number) {
  if (ti <= 0) return 0;
  const fac = Math.pow(1.03, Math.max(0, year - 2026));
  let tax = 0, lo = 0;
  for (const b of BR[f]) { if (ti <= lo) break; const up = b.upTo === Infinity ? Infinity : Math.round(b.upTo * fac / 100) * 100; tax += (Math.min(ti, up) - lo) * b.rate / 100; lo = up; }
  return Math.round(tax);
}
function ded(f: string, age: number, spouseAge: number | undefined, year: number) {
  const fac = year > 2026 ? Math.pow(1.03, year - 2026) : 1;
  const round = (c: number) => (year > 2026 ? Math.round(c * fac / 100) * 100 : c);
  let d = round(DED[f]);
  if (f === 'married_filing_jointly') { if (age >= 65) d += round(160_000); if (spouseAge != null && spouseAge >= 65) d += round(160_000); }
  else if (age >= 65) d += round(200_000);
  return d;
}

for (const income of [8_000_000, 15_000_000, 30_000_000, 60_000_000]) {
  for (const year of [2026, 2035]) {
    for (const [age, spouseAge] of [[70, 68], [62, 60]] as const) {
      const out = calculateWidowTaxImpact({ marriedIncome: income, widowIncome: income, year, marriedAge: age, spouseAge });
      const expMarried = fed(Math.max(0, income - ded('married_filing_jointly', age, spouseAge, year)), 'married_filing_jointly', year);
      const expSingle = fed(Math.max(0, income - ded('single', age, undefined, year)), 'single', year);
      r.ran(); if (Math.abs(out.marriedTax - expMarried) > TOL) r.record({ fixture: `widow/${income}/${year}/a${age}`, scenario: 'baseline', check: 'widow-married-tax', expected: expMarried, actual: out.marriedTax, delta: out.marriedTax - expMarried });
      r.ran(); if (Math.abs(out.singleTax - expSingle) > TOL) r.record({ fixture: `widow/${income}/${year}/a${age}`, scenario: 'baseline', check: 'widow-single-tax', expected: expSingle, actual: out.singleTax, delta: out.singleTax - expSingle });
      r.ran(); if (Math.abs(out.taxIncrease - (expSingle - expMarried)) > TOL) r.record({ fixture: `widow/${income}/${year}/a${age}`, scenario: 'baseline', check: 'widow-increase', expected: expSingle - expMarried, actual: out.taxIncrease, delta: out.taxIncrease - (expSingle - expMarried) });
      // THEORY: survivor never pays LESS than the couple on the same income.
      r.ran(); if (out.taxIncrease < -TOL) r.record({ fixture: `widow/${income}/${year}/a${age}`, scenario: 'baseline', check: 'widow-penalty-nonneg', actual: out.taxIncrease, note: 'single tax below married tax — penalty negative' });
      r.ran(); if (out.bracketJump < 0) r.record({ fixture: `widow/${income}/${year}/a${age}`, scenario: 'baseline', check: 'widow-bracket-nonneg', actual: out.bracketJump, note: 'single bracket below married' });
    }
  }
}

r.print('Widow-penalty module — independent + theory');
process.exit(r.breaches.length > 0 ? 1 : 0);
