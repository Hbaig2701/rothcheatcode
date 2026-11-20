/**
 * After-tax IRA basis (Form 8606 pro-rata) — utils/ira-basis.ts + engines.
 *
 * Part 1 reproduces Jim Ray's own Form 8606 worksheet ("Roth Conversion
 * Assumptions 07-17-2025.xlsx", Mike & Kathy Martin) to the cent: basis
 * $128,713.06 on a $911,136.37 IRA, 7% growth, 10/5/3-year conversion plans and
 * the no-conversion RMD path. His sheet grows the IRA first and distributes on
 * 12/31, so each year is fed as boyIra = year-end value before distributions
 * with zero in-year growth — the same 8606 line-6 denominator.
 *
 * Part 2 checks the engines: basis 0 changes nothing; with basis, tax goes
 * down, the whole basis is recovered when the IRA is drained (conservation),
 * the baseline gets it too, and a bracket fill converts MORE gross.
 *
 * Run: npx tsx lib/calculations/__tests__/audit/ira-basis.test.ts
 */
import { makeBasisYear } from '../../utils/ira-basis';
import { runGrowthSimulation, createSimulationInput } from '../../index';
import type { Client } from '../../../types/client';

let checks = 0;
const breaches: string[] = [];
const check = (ok: boolean, msg: string) => { checks++; if (!ok) breaches.push(msg); };
const c = (dollars: number) => Math.round(dollars * 100);

// ---------- Part 1: Jim's 8606 worksheet ----------
type Row = { yearEndBeforeDist: number; dist: number; nontax: number; basisAfter: number };
function runSheet(name: string, startBasis: number, rows: Row[]) {
  let basis = c(startBasis);
  for (const [i, r] of rows.entries()) {
    const by = makeBasisYear(basis, c(r.yearEndBeforeDist), 0);
    const nt = by.nontaxable(c(r.dist));
    check(Math.abs(nt - c(r.nontax)) <= 1, `${name} y${i + 1}: nontaxable ${nt / 100} vs sheet ${r.nontax}`);
    basis -= nt;
    check(Math.abs(basis - c(r.basisAfter)) <= 2, `${name} y${i + 1}: basis left ${basis / 100} vs sheet ${r.basisAfter}`);
  }
}
// 10-year plan (IRA Facts / 8606 sheet). Year-end value before distributions =
// 8606 line 6 "Subtotal"; dist = conversion + RMD.
runSheet('10yr', 128713.06, [
  { yearEndBeforeDist: 943026.14, dist: 114000, nontax: 15559.79, basisAfter: 113153.27 },
  { yearEndBeforeDist: 887057.97, dist: 114000, nontax: 14541.86, basisAfter: 98611.41 },
  { yearEndBeforeDist: 827172.03, dist: 114000, nontax: 13590.52, basisAfter: 85020.89 },
  { yearEndBeforeDist: 763094.07, dist: 140912.15, nontax: 15699.87, basisAfter: 69321.02 },
  { yearEndBeforeDist: 665734.66, dist: 138399.29, nontax: 14411.12, basisAfter: 54909.90 },
  { yearEndBeforeDist: 564248.84, dist: 135436.40, nontax: 13180.00, basisAfter: 41729.90 },
  { yearEndBeforeDist: 458829.31, dist: 132093.35, nontax: 12013.71, basisAfter: 29716.19 },
  { yearEndBeforeDist: 349607.48, dist: 128267.95, nontax: 10902.61, basisAfter: 18813.58 },
  { yearEndBeforeDist: 236833.30, dist: 124060.89, nontax: 9855.16, basisAfter: 8958.42 },
  // Final year drains the IRA: the whole remaining basis comes out.
  { yearEndBeforeDist: 120666.48, dist: 120666.48, nontax: 8958.42, basisAfter: 0 },
]);
// 5-year plan.
runSheet('5yr', 128713.06, [
  { yearEndBeforeDist: 943026.14, dist: 210750, nontax: 28765.14, basisAfter: 99947.92 },
  { yearEndBeforeDist: 783535.47, dist: 210750, nontax: 26883.31, basisAfter: 73064.61 },
  { yearEndBeforeDist: 612880.46, dist: 210750, nontax: 25124.59, basisAfter: 47940.03 },
  { yearEndBeforeDist: 430279.59, dist: 225924.73, nontax: 25171.63, basisAfter: 22768.40 },
  { yearEndBeforeDist: 218659.69, dist: 218659.69, nontax: 22768.40, basisAfter: 0 },
]);
// 3-year plan.
runSheet('3yr', 128713.06, [
  { yearEndBeforeDist: 943026.14, dist: 335800, nontax: 45833.14, basisAfter: 82879.92 },
  { yearEndBeforeDist: 649731.97, dist: 335800, nontax: 42834.71, basisAfter: 40045.22 },
  { yearEndBeforeDist: 335907.21, dist: 335907.21, nontax: 40045.22, basisAfter: 0 },
]);
// No conversion: RMDs only (2025–2027 have no distribution).
runSheet('baseline', 128713.06, [
  { yearEndBeforeDist: 943026.14, dist: 0, nontax: 0, basisAfter: 128713.06 },
  { yearEndBeforeDist: 1009037.97, dist: 0, nontax: 0, basisAfter: 128713.06 },
  { yearEndBeforeDist: 1079670.63, dist: 0, nontax: 0, basisAfter: 128713.06 },
  { yearEndBeforeDist: 1155247.58, dist: 40742.29, nontax: 4539.34, basisAfter: 124173.72 },
  { yearEndBeforeDist: 1192520.66, dist: 43706.09, nontax: 4550.99, basisAfter: 119622.73 },
  { yearEndBeforeDist: 1229231.59, dist: 46699.78, nontax: 4544.59, basisAfter: 115078.14 },
]);

// Helper invariants.
{
  const by = makeBasisYear(c(100000), c(1000000), 0.07);
  for (const base of [0, c(30000)]) {
    for (const t of [c(1), c(50000), c(200000)]) {
      const g = by.grossFor(base, t);
      check(Math.abs(by.incTaxable(base, g) - t) <= 2, `grossFor inverse base=${base} t=${t}`);
      check(g >= t, `gross >= taxable base=${base} t=${t}`);
    }
  }
  check(by.nontaxable(c(1000000)) === c(100000), 'draining the IRA recovers all basis');
  const none = makeBasisYear(0, c(1000000), 0.07);
  check(none.taxable(12345) === 12345 && none.grossFor(5, 777) === 777 && none.incTaxable(9, 33) === 33, 'zero basis is the identity');
}

// ---------- Part 2: engines ----------
const BASE = {
  age: 66, end_age: 95, filing_status: 'married_filing_jointly', spouse_age: 66, state: 'GA',
  blueprint_type: 'none', qualified_account_value: c(911136), taxable_accounts: c(500000), roth_ira: 0,
  rate_of_return: 7, baseline_comparison_rate: 7, post_contract_rate: 7, max_tax_rate: 24,
  tax_payment_source: 'from_taxable', ssi_annual_amount: c(42000), ssi_payout_age: 67,
  spouse_ssi_annual_amount: c(13000), spouse_ssi_payout_age: 67,
  non_ssi_income: [], heir_tax_rate: 40, aum_allocation_percent: 0, rmd_treatment: 'reinvested',
  conversion_type: 'optimized_amount', constraint_type: 'bracket_ceiling', years_to_defer_conversion: 0,
} as unknown as Client;

const run = (over: Partial<Client>) => runGrowthSimulation(createSimulationInput({ ...BASE, ...over } as Client, null));
const sum = (rows: { [k: string]: unknown }[], k: string) => rows.reduce((s, r) => s + ((r[k] as number) ?? 0), 0);

for (const conversion_type of ['optimized_amount', 'fixed_amount', 'full_conversion', 'partial_amount', 'no_conversion'] as const) {
  for (const tax_payment_source of ['from_taxable', 'from_ira'] as const) {
    const tag = `${conversion_type}/${tax_payment_source}`;
    const extra = { conversion_type, tax_payment_source, fixed_conversion_amount: c(114000), target_partial_amount: c(500000) } as Partial<Client>;
    const zero = run(extra);
    const nul = run({ ...extra, ira_basis: null } as Partial<Client>);
    const strip = (rows: object[]) => JSON.stringify(rows.map((r) => { const { iraBasisRecovered, iraBasisRemaining, ...rest } = r as Record<string, unknown>; void iraBasisRecovered; void iraBasisRemaining; return rest; }));
    check(strip(zero.formula) === strip(nul.formula) && strip(zero.baseline) === strip(nul.baseline), `${tag}: null basis == unset`);
    check(sum(zero.formula as never, 'iraBasisRecovered') === 0, `${tag}: no basis recovered without basis`);

    const withB = run({ ...extra, ira_basis: c(128713) } as Partial<Client>);
    const fTax = (r: typeof zero) => sum(r.formula as never, 'federalTax') + sum(r.formula as never, 'stateTax');
    const bTax = (r: typeof zero) => sum(r.baseline as never, 'federalTax') + sum(r.baseline as never, 'stateTax');
    // Basis can't make lifetime tax worse on either side.
    check(fTax(withB) <= fTax(zero) + 100, `${tag}: strategy tax with basis ${fTax(withB)} > without ${fTax(zero)}`);
    check(bTax(withB) < bTax(zero), `${tag}: baseline tax not reduced by basis (${bTax(withB)} vs ${bTax(zero)})`);
    // Conservation: recovered + remaining == starting basis, every year, both sides.
    for (const side of ['formula', 'baseline'] as const) {
      const rows = withB[side] as unknown as Record<string, number>[];
      let rec = 0;
      for (const r of rows) {
        rec += r.iraBasisRecovered ?? 0;
        check(Math.abs(rec + (r.iraBasisRemaining ?? 0) - c(128713)) <= 1, `${tag}/${side} y${r.year}: basis not conserved`);
        check((r.iraBasisRecovered ?? 0) <= (r.totalIRAWithdrawal ?? Infinity) + 1, `${tag}/${side} y${r.year}: recovered more than distributed`);
        if ((r.traditionalBalance ?? 1) === 0) check((r.iraBasisRemaining ?? 0) === 0, `${tag}/${side} y${r.year}: IRA empty but basis left`);
      }
    }
  }
}

// Bracket fill: same taxable room, larger gross conversion.
{
  const a = run({ conversion_type: 'optimized_amount' } as Partial<Client>);
  const b = run({ conversion_type: 'optimized_amount', ira_basis: c(128713) } as Partial<Client>);
  const y0a = a.formula[0], y0b = b.formula[0];
  check(y0b.conversionAmount > y0a.conversionAmount * 1.1, `bracket fill should convert >10% more with 14% basis (${y0b.conversionAmount} vs ${y0a.conversionAmount})`);
  check(Math.abs((y0b.taxableIncome ?? 0) - (y0a.taxableIncome ?? 0)) <= 200, `bracket fill: taxable income should match (${y0b.taxableIncome} vs ${y0a.taxableIncome})`);
}

console.log('\n=== IRA basis (Form 8606) — Jim Ray worksheet + engines ===');
console.log(`checks: ${checks}, breaches: ${breaches.length}`);
if (breaches.length) { for (const b of breaches.slice(0, 40)) console.log('  ✗ ' + b); process.exit(1); }
console.log('  ✓ all invariants held');
