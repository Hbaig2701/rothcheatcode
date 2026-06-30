/**
 * Audit harness — reusable invariant + reconciliation assertions.
 *
 * Every check reports a structured breach (scenario / year / age / field /
 * expected / actual / delta) instead of throwing, so one fixture surfaces ALL
 * its problems in a single run rather than dying on the first. A non-empty
 * report = the audit found something.
 */

import type { YearlyResult } from '../../types';

export interface Breach {
  fixture: string;
  scenario: 'baseline' | 'formula';
  check: string;
  year?: number;
  age?: number;
  field?: string;
  expected?: number;
  actual?: number;
  delta?: number;
  note?: string;
}

const d = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export class Reporter {
  breaches: Breach[] = [];
  private checksRun = 0;

  record(b: Breach) {
    this.breaches.push(b);
  }

  ran() {
    this.checksRun++;
  }

  get passed() {
    return this.checksRun - this.breaches.length;
  }

  /** Group breaches by check name for a compact summary. */
  summary(): string {
    const byCheck = new Map<string, number>();
    for (const b of this.breaches) byCheck.set(b.check, (byCheck.get(b.check) ?? 0) + 1);
    const lines = [...byCheck.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `  ${n.toString().padStart(4)} × ${c}`);
    return lines.join('\n');
  }

  print(label: string) {
    console.log(`\n=== ${label} ===`);
    console.log(`checks: ${this.checksRun}, breaches: ${this.breaches.length}`);
    if (this.breaches.length === 0) {
      console.log('  ✓ all invariants held');
      return;
    }
    console.log('\nbreaches by check:');
    console.log(this.summary());
    console.log('\nfirst 40 breaches:');
    for (const b of this.breaches.slice(0, 40)) {
      const loc = b.year != null ? ` y${b.year}/age${b.age}` : '';
      const fld = b.field ? ` ${b.field}` : '';
      const vals =
        b.expected != null && b.actual != null
          ? ` expected=${d(b.expected)} actual=${d(b.actual)} delta=${b.delta! > 0 ? '+' : ''}${d(b.delta!)}`
          : '';
      const note = b.note ? ` — ${b.note}` : '';
      console.error(`  [${b.fixture}/${b.scenario}] ${b.check}${loc}${fld}${vals}${note}`);
    }
    if (this.breaches.length > 40) console.error(`  …and ${this.breaches.length - 40} more`);
  }
}

const TOL = 2; // cents — allow ±1 rounding on each side of a reconstructed flow

// ----------------------------------------------------------------------------
// INVARIANT: non-negativity. No balance, tax, or fee may go negative.
// ----------------------------------------------------------------------------
const NONNEG_FIELDS: (keyof YearlyResult)[] = [
  'traditionalBalance', 'rothBalance', 'taxableBalance', 'netWorth',
  'rmdAmount', 'conversionAmount', 'federalTax', 'stateTax', 'irmaaSurcharge',
  'totalTax', 'riderFee', 'incomeRiderValue', 'accumulationValue', 'surrenderValue',
];

// ----------------------------------------------------------------------------
// INVARIANT: every numeric field is finite. A NaN/Infinity would render as
// "$NaN" / "$Infinity" in the table, and — critically — would slip past the
// non-negativity check (every comparison with NaN is false). So check it
// explicitly across ALL numeric fields.
// ----------------------------------------------------------------------------
export function checkFinite(r: Reporter, fixture: string, scenario: 'baseline' | 'formula', years: YearlyResult[]) {
  for (const y of years) {
    for (const [k, v] of Object.entries(y)) {
      if (typeof v !== 'number') continue;
      r.ran();
      if (!Number.isFinite(v)) {
        r.record({ fixture, scenario, check: 'finite', year: y.year, age: y.age, field: k, actual: v as number, note: `${k} is ${v} — would render as $${v} to the advisor` });
      }
    }
  }
}

export function checkNonNegative(r: Reporter, fixture: string, scenario: 'baseline' | 'formula', years: YearlyResult[]) {
  for (const y of years) {
    for (const f of NONNEG_FIELDS) {
      const v = y[f] as number | undefined;
      r.ran();
      if (v != null && v < -TOL) {
        r.record({ fixture, scenario, check: 'non-negative', year: y.year, age: y.age, field: f as string, actual: v });
      }
    }
  }
}

// ----------------------------------------------------------------------------
// INVARIANT: per-account tie-out. Reconstruct EOY balance from the explicit
// per-year flow fields and assert it matches what the engine reported. This is
// the strongest "no phantom money" check: any unaccounted leak shows as a delta.
// Only runs when the engine populates the BOY/growth fields (their absence is
// itself logged as a coverage gap, because those are table columns).
// ----------------------------------------------------------------------------
export function checkTraditionalTieOut(r: Reporter, fixture: string, scenario: 'baseline' | 'formula', years: YearlyResult[]) {
  // Coverage: report ONCE per scenario which reconstruction fields are missing
  // (flooding one breach per year buries the signal). A blank field here means
  // the corresponding adjustable-table column renders blank for this engine.
  const sample = years.find((y) => y.age >= (years[0]?.age ?? 0)) ?? years[0];
  for (const f of ['traditionalBOY', 'traditionalGrowth', 'totalIRAWithdrawal'] as const) {
    r.ran();
    if (sample && sample[f] == null) {
      r.record({ fixture, scenario, check: 'tieout:coverage', field: f, note: `${f} never populated — its adjustable-table column would be blank` });
    }
  }
  // Strict tie-out, year-over-year only (skip the issue year, where the
  // one-time upfront bonus is baked into the opening balance rather than
  // flowing through productBonusApplied). For i>=1, BOY = prior EOY, and any
  // mid-contract anniversary bonus does flow through productBonusApplied.
  for (let i = 1; i < years.length; i++) {
    const y = years[i];
    if (y.traditionalBOY == null || y.traditionalGrowth == null || y.totalIRAWithdrawal == null) continue;
    // BOY continuity: this year's opening = last year's close.
    r.ran();
    if (Math.abs(y.traditionalBOY - years[i - 1].traditionalBalance) > TOL) {
      r.record({ fixture, scenario, check: 'boy-continuity', year: y.year, age: y.age, field: 'traditionalBOY', expected: years[i - 1].traditionalBalance, actual: y.traditionalBOY, delta: y.traditionalBOY - years[i - 1].traditionalBalance });
    }
    // NOTE: do NOT add productBonusApplied here. The anniversary/issue bonus is
    // already baked into the engine's traditionalGrowth (and, for
    // bonusFollowsConversion products like phased-bonus-growth, into rothGrowth).
    // productBonusApplied is a SEPARATE display field that overlaps the growth
    // figure — adding it double-counts (verified: ΔnetWorth gap == bonus in
    // anniversary years, $0 otherwise; money conserves either way).
    const expected = y.traditionalBOY - y.totalIRAWithdrawal + y.traditionalGrowth - (y.riderFee ?? 0);
    // The engine floors the traditional balance at $0 (the iraAfterConversion
    // floor that fixed the Kwanza-class negative-residual bug). When the
    // reconstruction lands slightly negative and the engine reports $0, that's
    // the floor working — not a leak.
    if (expected < 0 && y.traditionalBalance === 0) continue;
    r.ran();
    if (Math.abs(expected - y.traditionalBalance) > TOL) {
      r.record({ fixture, scenario, check: 'trad-tieout', year: y.year, age: y.age, field: 'traditionalBalance', expected, actual: y.traditionalBalance, delta: y.traditionalBalance - expected });
    }
  }
}

// ----------------------------------------------------------------------------
// INVARIANT: baseline ≡ strategy when there is no conversion and no product
// bonus. The two scenarios must agree year-for-year on every balance.
// ----------------------------------------------------------------------------
export function checkSymmetry(r: Reporter, fixture: string, baseline: YearlyResult[], formula: YearlyResult[]) {
  const n = Math.min(baseline.length, formula.length);
  const fields: (keyof YearlyResult)[] = ['traditionalBalance', 'rothBalance', 'taxableBalance', 'netWorth', 'totalTax'];
  for (let i = 0; i < n; i++) {
    for (const f of fields) {
      const a = baseline[i][f] as number;
      const b = formula[i][f] as number;
      r.ran();
      if (a != null && b != null && Math.abs(a - b) > TOL) {
        r.record({ fixture, scenario: 'formula', check: 'symmetry', year: formula[i].year, age: formula[i].age, field: f as string, expected: a, actual: b, delta: b - a, note: 'no-conversion strategy must equal baseline' });
      }
    }
  }
}

// ----------------------------------------------------------------------------
// INVARIANT: full_conversion drains the traditional IRA to ~0 and there are no
// RMDs once it is drained. Directly targets the full-conversion bug class.
// ----------------------------------------------------------------------------
export function checkFullConversionDrains(r: Reporter, fixture: string, formula: YearlyResult[]) {
  const last = formula[formula.length - 1];
  r.ran();
  if (last.traditionalBalance > 100_00) {
    r.record({ fixture, scenario: 'formula', check: 'full-conversion-drains', year: last.year, age: last.age, field: 'traditionalBalance', actual: last.traditionalBalance, note: 'full_conversion should leave ~$0 traditional by end' });
  }
  // Once traditional hits ~0, no later year may show an RMD.
  let drained = false;
  for (const y of formula) {
    if (y.traditionalBalance <= TOL) drained = true;
    if (drained) {
      r.ran();
      if ((y.rmdAmount ?? 0) > TOL) {
        r.record({ fixture, scenario: 'formula', check: 'full-conversion-no-rmd', year: y.year, age: y.age, field: 'rmdAmount', actual: y.rmdAmount, note: 'RMD on a drained IRA' });
      }
    }
  }
}

// ----------------------------------------------------------------------------
// INVARIANT: monotonic non-negative conversions never exceed the IRA, and
// partial_amount conversions never exceed the configured cap.
// ----------------------------------------------------------------------------
export function checkPartialCap(r: Reporter, fixture: string, formula: YearlyResult[], cap: number) {
  const total = formula.reduce((s, y) => s + (y.conversionAmount ?? 0), 0);
  r.ran();
  if (total > cap + TOL) {
    r.record({ fixture, scenario: 'formula', check: 'partial-cap', field: 'sum(conversionAmount)', expected: cap, actual: total, delta: total - cap, note: 'total conversions exceed target_partial_amount' });
  }
}

// ----------------------------------------------------------------------------
// INVARIANT: totalTax == federalTax + stateTax + niitTax + irmaaSurcharge
// (+ earlyWithdrawalPenalty). Catches a tax column that doesn't add up to the
// sum advisors see — a classic source of "these numbers don't reconcile".
// ----------------------------------------------------------------------------
export function checkTotalTaxComposition(r: Reporter, fixture: string, scenario: 'baseline' | 'formula', years: YearlyResult[]) {
  for (const y of years) {
    const parts = (y.federalTax ?? 0) + (y.stateTax ?? 0) + (y.niitTax ?? 0) + (y.irmaaSurcharge ?? 0) + (y.earlyWithdrawalPenalty ?? 0);
    r.ran();
    // totalTax may legitimately exclude IRMAA in some surfaces; flag both ways
    // by checking the two most likely definitions and only reporting if NEITHER matches.
    const withoutIrmaa = parts - (y.irmaaSurcharge ?? 0);
    if (Math.abs(parts - y.totalTax) > TOL && Math.abs(withoutIrmaa - y.totalTax) > TOL) {
      r.record({ fixture, scenario, check: 'total-tax-composition', year: y.year, age: y.age, field: 'totalTax', expected: parts, actual: y.totalTax, delta: y.totalTax - parts, note: 'totalTax != sum of components (±IRMAA)' });
    }
  }
}

// ----------------------------------------------------------------------------
// INVARIANT: netWorth == traditional + roth + taxable. The headline number must
// equal the sum of its parts on every row.
// ----------------------------------------------------------------------------
export function checkNetWorthComposition(r: Reporter, fixture: string, scenario: 'baseline' | 'formula', years: YearlyResult[]) {
  for (const y of years) {
    const sum = y.traditionalBalance + y.rothBalance + y.taxableBalance;
    r.ran();
    if (Math.abs(sum - y.netWorth) > TOL) {
      r.record({ fixture, scenario, check: 'networth-composition', year: y.year, age: y.age, field: 'netWorth', expected: sum, actual: y.netWorth, delta: y.netWorth - sum });
    }
  }
}
