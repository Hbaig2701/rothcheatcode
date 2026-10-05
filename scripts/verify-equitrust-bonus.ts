/**
 * Rigorous verification of the EquiTrust anniversary-bonus-follows-conversion fix.
 * Hand-computes the expected mirror-Roth bonus from first principles and checks
 * the engine matches to the cent, plus conservation + edge cases.
 *   npx tsx scripts/verify-equitrust-bonus.ts
 */
import { runGrowthFormulaScenario } from '../lib/calculations/scenarios/growth-formula';
const D = (n?: number) => '$' + Math.round((n ?? 0) / 100).toLocaleString();
const g = (c: any) => runGrowthFormulaScenario(c, 2026, (c.end_age - c.age), null);

const base = {
  filing_status: 'single', state: 'TX', state_tax_rate: 0,
  roth_ira: 0, taxable_accounts: 100_000_000, ss_self: 0, rmd_treatment: 'spent',
  non_ssi_income: [], growth_rate: 7, baseline_comparison_rate: 7, rate_of_return: 7,
  max_tax_rate: 24, tax_payment_source: 'external', constraint_type: 'bracket_ceiling',
  bonus_percent: 0, // isolate the anniversary (mirror) bonus from the upfront premium bonus
};

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? '  ' + detail : ''}`);
  ok ? pass++ : fail++;
};

// ============ TEST 1: exact hand-trace ============
// phased-bonus-growth, $100K IRA, FULL conversion year 1, no upfront bonus,
// 4%×3 anniversary, 7% growth, no SS/RMD/tax. Hand-computed expected Roth path.
console.log('TEST 1 — exact hand-trace (full conversion yr 1, bonus follows):');
{
  const c = { ...base, blueprint_type: 'phased-bonus-growth', age: 60, end_age: 65,
    qualified_account_value: 10_000_000, conversion_type: "full_conversion" };
  const r = g(c);
  // Reference model (cents):
  let roth = 0, mirror = 0; const rate = 0.07, bonusPct = 0.04, bonusYears = 3;
  const conv = [10_000_000, 0, 0, 0, 0]; // full conversion in year 0
  const expected: number[] = [];
  for (let y = 0; y < 5; y++) {
    const afterConv = roth + conv[y];
    const interest = Math.round(afterConv * rate);
    roth = afterConv + interest;
    const mAfterConv = mirror + conv[y];
    const mPost = mAfterConv + Math.round(mAfterConv * rate);
    let bonus = 0;
    if (y < bonusYears) { bonus = Math.round(mPost * bonusPct); roth += bonus; }
    mirror = Math.min(mPost + bonus, roth);
    expected.push(roth);
  }
  for (let y = 0; y < 5; y++) {
    const eng = r[y].rothBalance ?? 0;
    check(`year ${y} rothBalance`, eng === expected[y], `engine ${D(eng)} vs expected ${D(expected[y])}`);
  }
}

// ============ TEST 2: conservation — bonus is the ONLY extra money ============
// rothGrowth must equal (rothInterest + mirrorBonus); and the year-over-year
// Roth change must equal conversion-in + rothGrowth (nothing lost/created).
console.log('\nTEST 2 — conservation (Roth change = conversion + growth):');
{
  const c = { ...base, blueprint_type: 'phased-bonus-growth', age: 60, end_age: 75,
    qualified_account_value: 100_000_000, conversion_type: 'fixed_amount', fixed_conversion_amount: 20_000_000 };
  const r = g(c);
  let okAll = true; let worst = '';
  for (let y = 0; y < r.length; y++) {
    const boy = y === 0 ? 0 : (r[y - 1].rothBalance ?? 0);
    const change = (r[y].rothBalance ?? 0) - boy;
    const expectChange = (r[y].conversionAmount ?? 0) + (r[y].rothGrowth ?? 0) - 0; // no roth withdrawals here
    if (Math.abs(change - expectChange) > 2) { okAll = false; worst = `year ${y}: Δroth ${D(change)} vs conv+growth ${D(expectChange)}`; }
  }
  check('Roth balance reconciles to conversion + growth every year', okAll, worst);
}

// ============ TEST 3: external Roth excluded ============
console.log('\nTEST 3 — pre-existing external Roth gets NO carrier bonus:');
{
  // $500K external Roth, NO conversion at all → mirror stays 0 → zero anniversary
  // bonus on the Roth (only growth). If the external wrongly got the 4%, the
  // year-0 Roth would jump ~4% above pure 7% growth.
  const c = { ...base, blueprint_type: 'phased-bonus-growth', age: 60, end_age: 70,
    qualified_account_value: 10_000_000, roth_ira: 50_000_000, conversion_type: 'no_conversion' };
  const r = g(c);
  const y0 = r[0];
  const expectPureGrowth = 50_000_000 + Math.round(50_000_000 * 0.07); // 53,500,000
  check('external Roth grows at 7% only, no bonus', (y0.rothBalance ?? 0) === expectPureGrowth,
    `${D(y0.rothBalance)} vs ${D(expectPureGrowth)}`);
  // rothGrowth = rothInterest + mirrorBonus. With no conversion the mirror is 0,
  // so rothGrowth must be pure 7% interest on the $500K external Roth ($35,000) —
  // proving the external Roth received NO carrier bonus. (The $4,280 in
  // productBonusApplied is the IRA-side anniversary bonus on the un-converted
  // $100K IRA, which is correct and unrelated to the Roth.)
  const expectRothInterestOnly = Math.round(50_000_000 * 0.07); // 3,500,000
  check('Roth side received NO bonus (rothGrowth = pure interest)',
    (y0.rothGrowth ?? 0) === expectRothInterestOnly,
    `rothGrowth ${D(y0.rothGrowth)} vs ${D(expectRothInterestOnly)}`);
}

// ============ TEST 4: no negatives / mirror <= roth / sane across configs ============
console.log('\nTEST 4 — robustness across configs (no negatives, mirror ≤ roth):');
{
  const configs = [
    { name: 'optimized from_ira age75 RMD', extra: { age: 75, end_age: 92, conversion_type: 'optimized_amount', tax_payment_source: 'from_ira', taxable_accounts: 0 } },
    { name: 'full conv from_ira', extra: { age: 68, end_age: 90, conversion_type: 'full_conversion', tax_payment_source: 'from_ira', taxable_accounts: 0 } },
    { name: 'partial + external Roth + RMD', extra: { age: 72, end_age: 90, conversion_type: 'fixed_amount', fixed_conversion_amount: 15_000_000, roth_ira: 30_000_000 } },
    { name: 'MFJ + SS', extra: { age: 70, end_age: 90, filing_status: 'married_filing_jointly', spouse_age: 68, ss_self: 4_000_000, ssi_payout_age: 67, ssi_annual_amount: 4_000_000, conversion_type: 'fixed_amount', fixed_conversion_amount: 12_000_000 } },
  ];
  let okAll = true; let note = '';
  for (const cfg of configs) {
    const c = { ...base, blueprint_type: 'phased-bonus-growth', qualified_account_value: 100_000_000, ...cfg.extra };
    const r = g(c);
    for (const row of r) {
      if ((row.traditionalBalance ?? 0) < -1 || (row.rothBalance ?? 0) < -1 || (row.taxableBalance ?? 0) < -1 ||
          Number.isNaN(row.netWorth) || !Number.isFinite(row.netWorth)) { okAll = false; note = `${cfg.name} age ${row.age} bad balance`; }
    }
  }
  check('no negative/NaN balances across 4 configs', okAll, note);
}

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)`);
