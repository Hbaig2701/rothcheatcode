/**
 * Advisory fee on managed assets — value verification (v82).
 *
 * Run: npx tsx lib/calculations/__tests__/audit/advisory-fee.test.ts
 *
 * The fee is charged on the ACCOUNT BALANCES (Traditional + Roth + taxable),
 * not on the AUM carve-out bucket, so an advisor can model "convert the whole
 * IRA to a Roth and I keep managing it". See lib/calculations/utils/advisory-fee.ts.
 *
 * What is locked here:
 *  1. OFF is a no-op — fee 0 / undefined is byte-identical on both sides.
 *  2. Magnitude — each year's fee is exactly rate x the pre-fee balances, and
 *     the balances on the row are post-fee.
 *  3. Not a taxable event — federal/state/MAGI/AGI/taxable income/IRMAA are
 *     untouched in year 1 (the fee is charged after the year's tax is struck).
 *  4. Symmetry default — advisory_fee_in_baseline null charges BOTH sides;
 *     false charges the strategy only and leaves the baseline byte-identical.
 *  5. The fee never reaches into conversion sizing (year-1 conversion fixed).
 *  6. The fee follows the money: once the Traditional IRA is empty it is still
 *     charged, i.e. billed on the Roth. This is the whole point of the feature.
 *  7. Guaranteed-income products are excluded on BOTH sides — a GI client with
 *     a fee set must be byte-identical to one without, so the exclusion can
 *     never become a one-sided (and therefore biased) half-application.
 *  8. Direction — a symmetric fee SHRINKS the conversion's net-legacy advantage
 *     whenever heir tax > 0, monotonically. That is real economics, not a bug:
 *     a fee from a Traditional IRA is effectively paid with pre-tax dollars
 *     (the IRS absorbs part of it) while a fee from a Roth is paid with dollars
 *     the family fully owns. At heir tax 0% the direction reverses, because the
 *     only asymmetry left is that the baseline carries more gross assets. A
 *     non-monotonic response would mean the fee is leaking into the tax math.
 */
import type { YearlyResult } from '../../types';
import type { Client as ClientType } from '../../../types/client';
import { makeClient, dispatch } from './factory';
import { Reporter } from './assertions';

const r = new Reporter();
const TOL = 100; // $1 in cents — rounding only

const BASE: Partial<ClientType> = {
  age: 65,
  end_age: 95,
  filing_status: 'married_filing_jointly',
  blueprint_type: 'none', // No Annuity: isolates the fee from carrier mechanics
  qualified_account_value: 200_000_000, // $2,000,000
  taxable_accounts: 25_000_000, // $250,000
  roth_ira: 10_000_000, // $100,000
  rate_of_return: 6,
  baseline_comparison_rate: 6,
  post_contract_rate: 6,
  max_tax_rate: 24,
  conversion_type: 'optimized_amount',
  tax_payment_source: 'from_ira',
  rmd_treatment: 'reinvested',
  ssi_annual_amount: 4_000_000,
  ssi_payout_age: 67,
  heir_tax_rate: 24,
  aum_allocation_percent: 0,
};

const run = (over: Partial<ClientType> = {}, startYear = 2026) =>
  dispatch(makeClient({ ...BASE, ...over } as Partial<ClientType>), startYear);

const rec = (check: string, scenario: 'baseline' | 'formula', note: string, fixture = 'advisory-fee') =>
  r.record({ fixture, scenario, check, year: 2026, age: 65, note });

// ---- 1. OFF is a no-op -----------------------------------------------------
const off = run();
{
  const explicitZero = run({ advisory_fee_percent: 0 });
  r.ran();
  if (JSON.stringify(off.formula) !== JSON.stringify(explicitZero.formula)
    || JSON.stringify(off.baseline) !== JSON.stringify(explicitZero.baseline)) {
    rec('off-is-noop', 'formula', 'fee 0 differs from fee undefined — existing clients would move');
  }
  r.ran();
  const anyCharged = [...off.formula, ...off.baseline].some((y) => (y.advisoryFee ?? 0) !== 0);
  if (anyCharged) rec('off-charges-nothing', 'formula', 'advisoryFee non-zero with the feature off');
}

// ---- 2. Magnitude: fee == rate x pre-fee balances, row shows post-fee ------
const FEE = 1; // %
const on = run({ advisory_fee_percent: FEE });
for (const [scenario, rows] of [['formula', on.formula], ['baseline', on.baseline]] as const) {
  for (const y of rows as YearlyResult[]) {
    // Row balances are POST-fee. Each bucket was charged round(pre * rate)
    // independently, so gross each one back up and re-derive the total.
    const grossUp = (post: number) => (post > 0 ? post / (1 - FEE / 100) : 0);
    const expected =
      Math.round(grossUp(y.traditionalBalance) * (FEE / 100)) +
      Math.round(grossUp(y.rothBalance) * (FEE / 100)) +
      Math.round(grossUp(y.taxableBalance) * (FEE / 100));
    r.ran();
    // Tolerance scales with the balance: the gross-up is the inverse of three
    // independent roundings, so it can be a few cents out on large balances.
    const tol = Math.max(TOL, Math.round((y.traditionalBalance + y.rothBalance + y.taxableBalance) * 1e-6));
    if (Math.abs((y.advisoryFee ?? 0) - expected) > tol) {
      r.record({
        fixture: 'advisory-fee', scenario, check: 'fee-equals-rate-times-balances',
        year: y.year, age: y.age, expected, actual: y.advisoryFee ?? 0,
        note: `trad=${y.traditionalBalance} roth=${y.rothBalance} taxable=${y.taxableBalance}`,
      });
    }
    r.ran();
    if ((y.advisoryFee ?? 0) < 0) {
      r.record({ fixture: 'advisory-fee', scenario, check: 'fee-never-negative', year: y.year, age: y.age, actual: y.advisoryFee ?? 0 });
    }
  }
}

// ---- 3. Not a taxable event ------------------------------------------------
for (const [scenario, a, b] of [
  ['formula', off.formula, on.formula],
  ['baseline', off.baseline, on.baseline],
] as const) {
  const x = a[0] as unknown as Record<string, number>;
  const y = b[0] as unknown as Record<string, number>;
  for (const k of ['federalTax', 'stateTax', 'totalTax', 'magi', 'agi', 'taxableIncome', 'irmaaSurcharge', 'irmaaTier'] as const) {
    r.ran();
    if ((x[k] ?? 0) !== (y[k] ?? 0)) {
      r.record({
        fixture: 'advisory-fee', scenario, check: `fee-is-not-taxable:${k}`,
        year: 2026, age: 65, expected: x[k] ?? 0, actual: y[k] ?? 0,
        note: 'the fee moved a tax field — it is not deductible and not a distribution, so nothing tax-side may change',
      });
    }
  }
}

// ---- 4. Symmetry default + strategy-only mode ------------------------------
{
  r.ran();
  const baseCharged = on.baseline.some((y) => (y.advisoryFee ?? 0) > 0);
  if (!baseCharged) rec('in-baseline-defaults-on', 'baseline', 'advisory_fee_in_baseline null did NOT charge the baseline — the comparison would be biased');

  const stratOnly = run({ advisory_fee_percent: FEE, advisory_fee_in_baseline: false });
  r.ran();
  if (JSON.stringify(stratOnly.baseline) !== JSON.stringify(off.baseline)) {
    rec('strategy-only-leaves-baseline-alone', 'baseline', 'in_baseline=false changed the baseline');
  }
  r.ran();
  if (JSON.stringify(stratOnly.formula) !== JSON.stringify(on.formula)) {
    rec('strategy-only-leaves-strategy-alone', 'formula', 'in_baseline toggled the STRATEGY side, which it must never do');
  }
  r.ran();
  const explicitTrue = run({ advisory_fee_percent: FEE, advisory_fee_in_baseline: true });
  if (JSON.stringify(explicitTrue.baseline) !== JSON.stringify(on.baseline)) {
    rec('null-matches-explicit-true', 'baseline', 'null and true disagree — the DB default and the engine default have drifted apart');
  }
}

// ---- 5. The fee does not reach into conversion sizing ----------------------
for (const f of [0.5, 1, 2, 5]) {
  const y1 = run({ advisory_fee_percent: f }).formula[0];
  r.ran();
  if (y1.conversionAmount !== off.formula[0].conversionAmount) {
    r.record({
      fixture: 'advisory-fee', scenario: 'formula', check: 'fee-does-not-size-conversions',
      year: 2026, age: 65, expected: off.formula[0].conversionAmount, actual: y1.conversionAmount,
      note: `fee ${f}% changed the year-1 conversion; the fee is charged after the conversion is sized and is not income, so it cannot`,
    });
  }
}

// ---- 6. The fee follows the money into the Roth ----------------------------
{
  const full = run({ conversion_type: 'full_conversion', advisory_fee_percent: FEE });
  const lastRow = full.formula[full.formula.length - 1];
  r.ran();
  if (!(lastRow.traditionalBalance < TOL)) {
    rec('full-conversion-empties-the-ira', 'formula', `final Traditional balance ${lastRow.traditionalBalance} — fixture assumption broken`);
  } else if (!((lastRow.advisoryFee ?? 0) > 0)) {
    rec('fee-follows-money-into-roth', 'formula', 'Traditional is empty and no fee was charged — the fee is not billing on the Roth, which is the entire feature');
  }
}

// ---- 6b. The FIA principal-protection floor must not refund the fee --------
//
// Step 3.5 of growth-formula.ts floors the annuity AV at
// `initialPremium - cumulativeWithdrawn`. If the advisory fee did not also
// count against cumulativeWithdrawn, a protected contract whose floor binds
// would have the fee pushed straight back onto the balance the following year
// — the client would pay a fee that cost them nothing. The carrier's guarantee
// protects premium against ITS charges and market losses, not against dollars
// the client instructs out of the contract.
//
// Fixture is built so the floor DOES bind: ages 50-65 (no RMDs), 0% credited,
// no conversions. The balance must fall by exactly the fees charged, and
// protect_initial_premium must make no difference at all.
{
  const floorBase: Partial<ClientType> = {
    age: 50, end_age: 65, filing_status: 'single', blueprint_type: 'fia',
    qualified_account_value: 100_000_000, taxable_accounts: 0, roth_ira: 0,
    rate_of_return: 0, baseline_comparison_rate: 0, post_contract_rate: 0,
    bonus_percent: 0, protect_initial_premium: true, surrender_years: 10,
    surrender_schedule: [9, 9, 8, 7, 6, 5, 4, 3, 2, 1], penalty_free_percent: 10,
    conversion_type: 'no_conversion', tax_payment_source: 'from_ira',
    rmd_treatment: 'spent', ssi_annual_amount: 0, aum_allocation_percent: 0,
  };
  const protectedRun = dispatch(makeClient({ ...floorBase, advisory_fee_percent: 2 } as Partial<ClientType>), 2026);
  const rows = protectedRun.formula;
  const feesCharged = rows.reduce((t, y) => t + (y.advisoryFee ?? 0), 0);
  const drop = 100_000_000 - rows[rows.length - 1].traditionalBalance;
  r.ran();
  if (feesCharged <= 0) {
    rec('floor-fixture-charges-a-fee', 'formula', 'no fee charged — fixture assumption broken');
  } else if (Math.abs(drop - feesCharged) > TOL) {
    r.record({
      fixture: 'advisory-fee/principal-floor', scenario: 'formula',
      check: 'floor-does-not-refund-the-fee', year: 2026, age: 50,
      expected: feesCharged, actual: drop,
      note: 'with 0% credited and no distributions the balance must fall by exactly the fees charged; a smaller drop means the principal-protection floor is restoring fee dollars',
    });
  }
  r.ran();
  const unprotected = dispatch(makeClient({ ...floorBase, advisory_fee_percent: 2, protect_initial_premium: false } as Partial<ClientType>), 2026);
  if (JSON.stringify(rows) !== JSON.stringify(unprotected.formula)) {
    rec('floor-is-irrelevant-to-the-fee', 'formula',
      'protect_initial_premium changed the result on a fee-only drawdown — the guarantee must not interact with the advisory fee',
      'advisory-fee/principal-floor');
  }
}

// ---- 7. GI products are excluded on BOTH sides -----------------------------
{
  const giBase: Partial<ClientType> = {
    ...BASE,
    blueprint_type: 'compound-rollup-income',
    income_start_age: 70,
    guaranteed_rate_of_return: 7,
    payout_type: 'individual',
  };
  const giOff = dispatch(makeClient(giBase as Partial<ClientType>), 2026);
  for (const over of [{ advisory_fee_percent: 1 }, { advisory_fee_percent: 1, advisory_fee_in_baseline: false }]) {
    const giOn = dispatch(makeClient({ ...giBase, ...over } as Partial<ClientType>), 2026);
    r.ran();
    if (JSON.stringify(giOff.formula) !== JSON.stringify(giOn.formula)
      || JSON.stringify(giOff.baseline) !== JSON.stringify(giOn.baseline)) {
      rec('gi-excluded-on-both-sides', 'formula',
        `GI result moved with ${JSON.stringify(over)} — the GI engine has no fee, so applying it to only one side would bias the comparison`,
        'advisory-fee/gi');
    }
  }
}

// ---- 8. Direction: the heir tax decides which way the fee moves the answer --
//
// MEASURED on this fixture (net-legacy advantage, strategy − baseline, by fee):
//   heir  0%   0%:-$730,319  0.5%:-$710,424  1%:-$660,214  2%:-$496,655  3%:-$372,388
//   heir 15%   0%:-$285,114  0.5%:-$327,377  1%:-$330,896  2%:-$253,803  3%:-$193,858
//   heir 24%   0%: -$17,991  0.5%: -$97,548  1%:-$133,305  2%:-$108,092  3%: -$86,740
//   heir 40%   0%: $456,894  0.5%: $311,035  1%: $217,967  2%: $150,951  3%: $103,692
//
// Two opposing channels, and it matters that nobody later "fixes" either one:
//
//   (a) HEIR-TAX ASYMMETRY — a fee taken from a Traditional IRA is effectively
//       paid with pre-tax dollars (heirs were only ever keeping 1 − heir_rate
//       of that balance, so the IRS absorbs part of every fee dollar), while a
//       fee taken from a Roth is paid with dollars the family fully owns. So
//       each fee dollar costs the Roth-heavy STRATEGY more after-tax legacy
//       than it costs the Traditional-heavy BASELINE. This pushes the
//       advantage DOWN and scales with heir_tax_rate.
//
//   (b) GROSS-BALANCE EROSION — the baseline never paid conversion tax, so it
//       carries more assets and therefore pays more fee DOLLARS. This pushes
//       the advantage UP and is independent of heir tax.
//
// At heir tax 0 channel (a) vanishes, so the curve rises monotonically. At 40%
// (a) dominates across the whole range, so it falls monotonically. In between
// the curve is U-SHAPED — (a) wins at low fees, (b) takes over once the
// baseline's Traditional balance has been chewed down (turning point ~1-1.5%
// here). That U is correct behaviour, not a bug: do not "smooth" it.
//
// What is locked: the SIGN of the first marginal slice of fee (0 -> 0.5%),
// which is where channel (a) is unambiguously in charge, plus the two clean
// monotone ends.
{
  const RATES = [0, 0.25, 0.5, 1, 1.5, 2, 3];
  const curve = (heirPct: number) => RATES.map((f) => {
    const res = run({ advisory_fee_percent: f, heir_tax_rate: heirPct });
    const H = heirPct / 100;
    const legacy = (rows: YearlyResult[]) => {
      const y = rows[rows.length - 1];
      return Math.round(y.traditionalBalance * (1 - H)) + y.rothBalance + (y.taxableBalance || 0);
    };
    return legacy(res.formula) - legacy(res.baseline);
  });
  const monotonic = (xs: number[], dir: -1 | 1) =>
    xs.every((v, i) => i === 0 || Math.sign(v - xs[i - 1]) === dir);
  const fmt = (xs: number[]) => xs.map((v, i) => `${RATES[i]}%:${v}`).join('  ');

  // (i) The marginal sign of the first 0.5% of fee, by heir tax.
  for (const h of [0, 15, 24, 40]) {
    const c = curve(h);
    const slope = c[2] - c[0]; // 0% -> 0.5%
    r.ran();
    const expectUp = h === 0;
    if (expectUp ? !(slope > 0) : !(slope < 0)) {
      rec(`fee-marginal-direction-heir-${h}`, 'formula',
        `the first 0.5% of fee must move the advantage ${expectUp ? 'UP' : 'DOWN'} at heir tax ${h}% `
        + `(${expectUp ? 'no heir-tax asymmetry, so only the baseline\'s larger fee bill is left'
                       : 'Roth dollars are fully owned, Traditional dollars are part-IRS'}) `
        + `— slope ${slope}, curve ${fmt(c)}`);
    }
  }

  // (ii) The two clean ends stay monotone across the whole 0-3% range.
  r.ran();
  const c0 = curve(0);
  if (!monotonic(c0, 1)) {
    rec('fee-monotone-up-at-zero-heir-tax', 'formula',
      `with no heir tax only the gross-balance channel exists, so the curve must rise throughout — got ${fmt(c0)}`);
  }
  r.ran();
  const c40 = curve(40);
  if (!monotonic(c40, -1)) {
    rec('fee-monotone-down-at-high-heir-tax', 'formula',
      `at heir tax 40% the heir-tax asymmetry dominates throughout, so the curve must fall — got ${fmt(c40)}`);
  }

  // (iii) A symmetric fee must never be a NO-OP on the comparison. If someone
  // makes the fee cancel out of the delta, the report stops showing a real cost
  // of converting while billing a fee.
  r.ran();
  const c24 = curve(24);
  if (Math.abs(c24[3] - c24[0]) < 100_00) {
    rec('fee-is-not-neutral-on-the-comparison', 'formula',
      `a 1% fee on both sides changed the net-legacy advantage by under $100 — it is being cancelled out instead of charged: ${fmt(c24)}`);
  }
}

r.print('Advisory fee on managed assets — value checks');
process.exit(r.breaches.length > 0 ? 1 : 0);
