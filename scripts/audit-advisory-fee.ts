/**
 * Verify the advisory-fee feature end to end on the growth + standard engines.
 *
 * Checks, in order:
 *   1. OFF is a no-op — fee 0/undefined reproduces the pre-feature numbers
 *      byte-for-byte on both sides.
 *   2. Fee lands on BOTH sides by default (advisory_fee_in_baseline null).
 *   3. The conversion still wins with the fee on both sides (the whole point:
 *      same tax in, no ongoing drag — the fee must not flip the answer).
 *   4. Strategy-only mode penalises the strategy and NOTHING else.
 *   5. Magnitude sanity: year-1 fee == rate x year-1 managed balances.
 *   6. The fee is NOT a taxable event — federal/state/IRMAA/MAGI unchanged in
 *      year 1 (the fee is charged at END of year, so year 1 tax can't move).
 *   7. 100% conversion + fee on both sides — the headline use case.
 *
 * Usage: npx tsx scripts/audit-advisory-fee.ts
 */
import { runGrowthSimulation, runSimulation, createSimulationInput } from '../lib/calculations';
import type { Client } from '../lib/types/client';

const D = (c: number) => `$${Math.round(c / 100).toLocaleString()}`;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

const BASE = {
  age: 65,
  spouse_age: 63,
  end_age: 95,
  filing_status: 'married_filing_jointly',
  state: 'FL',
  blueprint_type: 'none',            // No Annuity: isolates the fee from carrier mechanics
  qualified_account_value: 2_000_000 * 100,
  taxable_accounts: 250_000 * 100,
  roth_ira: 100_000 * 100,
  rate_of_return: 6,
  baseline_comparison_rate: 6,
  post_contract_rate: 6,
  max_tax_rate: 24,
  conversion_type: 'optimized_amount',
  tax_payment_source: 'from_ira',
  rmd_treatment: 'reinvested',
  withdrawal_type: 'no_withdrawals',
  ssi_annual_amount: 40_000 * 100,
  spouse_ssi_annual_amount: 24_000 * 100,
  ssi_payout_age: 67,
  spouse_ssi_payout_age: 67,
  non_ssi_income: [],
  aum_allocation_percent: 0,
  heir_tax_rate: 24,
  projection_years: 30,
} as unknown as Client;

const mk = (over: Partial<Client>) => ({ ...BASE, ...over }) as Client;
const last = (rows: Array<{ netWorth?: number }>) => rows[rows.length - 1]?.netWorth ?? 0;
// NET LEGACY is the metric a conversion is judged on, not raw net worth: the
// strategy pays tax up front (so its gross net worth is lower) but hands heirs
// a Roth that owes nothing, while the baseline's Traditional balance is taxed
// at heir_tax_rate. Same formula as transforms.ts calculateBaselineLegacyToHeirs.
const HEIR = (BASE.heir_tax_rate ?? 40) / 100;
const legacy = (rows: Array<{ traditionalBalance: number; rothBalance: number; taxableBalance: number }>) => {
  const y = rows[rows.length - 1];
  return Math.round(y.traditionalBalance * (1 - HEIR)) + y.rothBalance + (y.taxableBalance || 0);
};
const sum = (rows: Array<{ advisoryFee?: number }>) => rows.reduce((t, r) => t + (r.advisoryFee ?? 0), 0);

// ---------------------------------------------------------------------------
console.log('\n=== 1. OFF is a no-op (fee undefined vs explicit 0) ===');
const offA = runGrowthSimulation(createSimulationInput(mk({}), null));
const offB = runGrowthSimulation(createSimulationInput(mk({ advisory_fee_percent: 0 }), null));
check('strategy identical', JSON.stringify(offA.formula) === JSON.stringify(offB.formula));
check('baseline identical', JSON.stringify(offA.baseline) === JSON.stringify(offB.baseline));
check('no advisoryFee dollars charged', sum(offA.formula) === 0 && sum(offA.baseline) === 0);

// ---------------------------------------------------------------------------
console.log('\n=== 2. Default (in_baseline null) charges BOTH sides ===');
const both = runGrowthSimulation(createSimulationInput(mk({ advisory_fee_percent: 1 }), null));
check('strategy charged', sum(both.formula) > 0, D(sum(both.formula)) + ' over 30y');
check('baseline charged', sum(both.baseline) > 0, D(sum(both.baseline)) + ' over 30y');
check('strategy net worth fell vs OFF', last(both.formula) < last(offA.formula),
  `${D(last(offA.formula))} -> ${D(last(both.formula))}`);
check('baseline net worth fell vs OFF', last(both.baseline) < last(offA.baseline),
  `${D(last(offA.baseline))} -> ${D(last(both.baseline))}`);

// ---------------------------------------------------------------------------
console.log('\n=== 3. The conversion still wins with the fee on both sides ===');
const offDelta = legacy(offA.formula) - legacy(offA.baseline);
const bothDelta = legacy(both.formula) - legacy(both.baseline);
check('strategy beats baseline on NET LEGACY, fee OFF', offDelta > 0, D(offDelta));
check('strategy beats baseline on NET LEGACY, fee ON both sides', bothDelta > 0, D(bothDelta));
console.log(`        net-legacy advantage ${D(offDelta)} -> ${D(bothDelta)} (${((bothDelta / offDelta - 1) * 100).toFixed(1)}%)`);
console.log(`        (raw net worth is LOWER for the strategy either way — ${D(last(both.formula) - last(both.baseline))} — because the conversion pre-pays the tax)`);

// ---------------------------------------------------------------------------
console.log('\n=== 4. Strategy-only mode penalises the strategy only ===');
const stratOnly = runGrowthSimulation(createSimulationInput(
  mk({ advisory_fee_percent: 1, advisory_fee_in_baseline: false }), null));
check('baseline unchanged vs OFF', JSON.stringify(stratOnly.baseline) === JSON.stringify(offA.baseline));
check('strategy identical to both-sides run', JSON.stringify(stratOnly.formula) === JSON.stringify(both.formula));
const stratOnlyDelta = legacy(stratOnly.formula) - legacy(stratOnly.baseline);
check('advantage is SMALLER than the symmetric run', stratOnlyDelta < bothDelta,
  `${D(stratOnlyDelta)} vs ${D(bothDelta)} — the asymmetry is worth ${D(bothDelta - stratOnlyDelta)}`);

// ---------------------------------------------------------------------------
console.log('\n=== 5. Magnitude: year-1 fee == rate x year-1 managed balances ===');
for (const [side, rows] of [['strategy', both.formula], ['baseline', both.baseline]] as const) {
  const y1 = rows[0] as { traditionalBalance: number; rothBalance: number; taxableBalance: number; advisoryFee?: number };
  // Balances on the row are POST-fee, so gross them back up: b_post = b_pre - round(b_pre * r).
  const expected = Math.round(
    ((y1.traditionalBalance + y1.rothBalance + y1.taxableBalance) / (1 - 0.01)) * 0.01
  );
  const actual = y1.advisoryFee ?? 0;
  check(`${side} year-1 fee within $5 of 1% of managed balances`, Math.abs(actual - expected) < 500,
    `${D(actual)} vs ${D(expected)}`);
}

// ---------------------------------------------------------------------------
console.log('\n=== 6. The fee is not a taxable event (year-1 tax untouched) ===');
for (const [side, a, b] of [
  ['strategy', offA.formula, both.formula],
  ['baseline', offA.baseline, both.baseline],
] as const) {
  const x = a[0] as unknown as Record<string, number>;
  const y = b[0] as unknown as Record<string, number>;
  const same = (['federalTax', 'stateTax', 'totalTax', 'magi', 'agi', 'taxableIncome', 'irmaaSurcharge', 'irmaaTier'] as const)
    .every((k) => (x[k] ?? 0) === (y[k] ?? 0));
  check(`${side} year-1 tax/MAGI/IRMAA identical`, same);
}

// ---------------------------------------------------------------------------
console.log('\n=== 7. The fee follows the money into the Roth ===');
const fullFee = runGrowthSimulation(createSimulationInput(
  mk({ conversion_type: 'full_conversion', advisory_fee_percent: 1 }), null));
check('full conversion actually converts', (fullFee.formula[0].conversionAmount ?? 0) > 0,
  D(fullFee.formula[0].conversionAmount ?? 0) + ' in year 1');
check('fee still charged once the Traditional IRA is empty', (() => {
  const late = fullFee.formula[fullFee.formula.length - 1] as { traditionalBalance: number; advisoryFee?: number };
  return late.traditionalBalance < 100 && (late.advisoryFee ?? 0) > 0;
})(), 'final-year fee ' + D(fullFee.formula[fullFee.formula.length - 1].advisoryFee ?? 0)
  + ' on a $0 Traditional balance — i.e. billed on the Roth');

// ---------------------------------------------------------------------------
// A symmetric fee does NOT simply cancel out of the comparison, and it is worth
// being precise about why, because the direction is counter-intuitive.
//
// A fee debited from a Traditional IRA is effectively paid with PRE-TAX dollars:
// the heirs were only ever going to keep (1 - heir_rate) of that balance, so the
// IRS absorbs part of every fee dollar. A fee debited from a Roth is paid with
// fully-owned dollars. So each fee dollar costs the STRATEGY (Roth-heavy) more
// after-tax legacy than it costs the BASELINE (Traditional-heavy), and raising
// the fee SHRINKS the conversion's net-legacy advantage. On a thin-margin case
// a high enough fee can legitimately flip the answer — that is real economics
// the advisor should see, not a modelling artifact.
//
// The control is heir_tax_rate: at 0% there is no heir-tax asymmetry, so the
// only thing left is that the baseline carries more gross assets and therefore
// pays more fee dollars — and the fee then HELPS the strategy. Both directions
// must be monotonic in the fee rate; a non-monotonic response would mean the
// fee is leaking into the conversion sizing or the tax math.
console.log('\n=== 9. Fee effect on the comparison is monotonic, and signed by heir tax ===');
const RATES = [0, 0.5, 1, 1.5, 2];
function deltaCurve(heirPct: number): number[] {
  return RATES.map((f) => {
    const r = runGrowthSimulation(createSimulationInput(
      mk({ advisory_fee_percent: f, heir_tax_rate: heirPct }), null));
    const H = heirPct / 100;
    const leg = (rows: typeof r.formula) => {
      const y = rows[rows.length - 1];
      return Math.round(y.traditionalBalance * (1 - H)) + y.rothBalance + (y.taxableBalance || 0);
    };
    return leg(r.formula) - leg(r.baseline);
  });
}
const mono = (xs: number[], dir: -1 | 1) => xs.every((v, i) => i === 0 || Math.sign(v - xs[i - 1]) === dir);

const c0 = deltaCurve(0);
check('heir tax 0%: advantage rises with the fee (baseline pays more fee dollars)', mono(c0, 1),
  c0.map((v, i) => `${RATES[i]}%:${D(v)}`).join('  '));

for (const h of [24, 40]) {
  const c = deltaCurve(h);
  check(`heir tax ${h}%: advantage falls with the fee (Roth dollars are heir-expensive)`, mono(c, -1),
    c.map((v, i) => `${RATES[i]}%:${D(v)}`).join('  '));
}

// And the one thing that WOULD be a bug: the fee must not change the conversion
// schedule. It is charged at end of year, after the conversion is sized, and it
// is not taxable income — so the only legitimate channel is next year's smaller
// RMD base, which cannot alter a bracket-filling conversion's FIRST year.
console.log('\n=== 10. The fee does not reach into conversion sizing (year 1) ===');
for (const f of [1, 2, 5]) {
  const r = runGrowthSimulation(createSimulationInput(mk({ advisory_fee_percent: f }), null));
  check(`fee ${f}%: year-1 conversion unchanged`,
    r.formula[0].conversionAmount === offA.formula[0].conversionAmount,
    `${D(r.formula[0].conversionAmount ?? 0)} vs ${D(offA.formula[0].conversionAmount ?? 0)}`);
}

// ---------------------------------------------------------------------------
console.log('\n=== 8. Standard engine (legacy path: blueprint_type unset) ===');
// Every named blueprint_type routes to the growth or GI engine, so runSimulation
// (scenarios/formula.ts) is reached only by legacy clients with no product set.
const stdOff = runSimulation(createSimulationInput(mk({ blueprint_type: undefined }), null));
const stdFee = runSimulation(createSimulationInput(
  mk({ blueprint_type: undefined, advisory_fee_percent: 1 }), null));
check('OFF vs ON differs on the strategy', last(stdOff.formula) !== last(stdFee.formula),
  `${D(last(stdOff.formula))} -> ${D(last(stdFee.formula))}`);
check('strategy charged', sum(stdFee.formula) > 0, D(sum(stdFee.formula)));
check('baseline charged', sum(stdFee.baseline) > 0, D(sum(stdFee.baseline)));
check('strategy still beats baseline on net legacy', legacy(stdFee.formula) - legacy(stdFee.baseline) > 0,
  D(legacy(stdFee.formula) - legacy(stdFee.baseline)));

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
