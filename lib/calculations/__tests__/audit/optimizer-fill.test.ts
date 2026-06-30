/**
 * Optimizer bracket-fill correctness (audit F6).
 *
 * Run: npx tsx lib/calculations/__tests__/audit/optimizer-fill.test.ts
 *
 * An `optimized_amount` conversion must fill the target bracket to ~100% every
 * year there is IRA left and the conversion window is open — that's the whole
 * point of "optimized". This is a CORRECTNESS check (not a consistency one): a
 * value can conserve money and still under-convert.
 *
 * Known gap F6: with tax paid from the IRA, the fill drops to ~85% once RMDs
 * begin (the RMD-funds-tax credit was applied to full/fixed but not to
 * optimized/partial). This test DOCUMENTS that gap today (exit 0); flip the
 * `EXPECT_FIXED` flag to true once formula.ts:455 is fixed to make it a guard.
 */

import { makeClient, dispatch } from './factory';
import { getBracketCeiling } from '../../../data/federal-brackets-2026';

const EXPECT_FIXED = true; // F6 fix landed (formula.ts optimized/partial RMD-funded fill)

type Row = { age: number; fill: number; room: number; tax: number; iraLeft: number };
function fills(extra: Record<string, unknown>): Row[] {
  const { formula } = dispatch(makeClient({
    conversion_type: 'optimized_amount', max_tax_rate: 24, age: 67, end_age: 88,
    qualified_account_value: 250_000_000, ssi_payout_age: 67, ssi_annual_amount: 4_000_000,
    post_contract_rate: 6, ...extra,
  }));
  return formula.filter((y) => (y.conversionAmount ?? 0) > 0 && y.traditionalBalance > 1_000_000)
    .map((y) => {
      const ceiling = getBracketCeiling('single', 24, y.year);
      return { age: y.age, fill: (y.taxableIncome ?? 0) / ceiling * 100, room: ceiling - (y.taxableIncome ?? 0), tax: y.taxesPaidFromIRA ?? 0, iraLeft: y.traditionalBalance };
    });
}

const d = (c: number) => `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
let problems = 0;

// Control: funded taxable account (tax NOT from IRA) — must fill to ~100% always.
const ctrl = fills({ taxable_accounts: 200_000_000, tax_payment_source: 'from_taxable' });
const ctrlBad = ctrl.filter((r) => r.fill < 99);
console.log(`control (tax from funded taxable): ${ctrl.length} conversion-years, ${ctrlBad.length} under 99% fill`);
if (ctrlBad.length > 0) { problems++; for (const r of ctrlBad.slice(0, 5)) console.error(`  age${r.age} fill ${r.fill.toFixed(1)}% room ${d(r.room)}`); }

// Subject: tax from IRA — F6 says this under-fills once RMDs start (age 73+).
const ira = fills({ taxable_accounts: 0, tax_payment_source: 'from_ira' });
const underRmd = ira.filter((r) => r.age >= 73 && r.fill < 95);
const lostRoom = underRmd.reduce((s, r) => s + r.room, 0);
console.log(`subject (tax from IRA): ${ira.length} conversion-years, ${underRmd.length} under-filled at RMD age, total unfilled bracket room ${d(lostRoom)}`);
for (const r of underRmd.slice(0, 6)) console.log(`  age${r.age} fill ${r.fill.toFixed(1)}% room ${d(r.room)} (== taxFromIRA ${d(r.tax)})`);

if (EXPECT_FIXED) {
  if (underRmd.length > 0) { problems++; console.error('F6 NOT fixed: optimizer still under-fills at RMD age with tax from IRA'); }
} else if (underRmd.length > 0) {
  console.log('\n⚠️  KNOWN BUG F6 (documented, awaiting fix): optimized_amount + from-IRA tax under-converts at RMD age.');
}

console.log(`\n=== ${problems === 0 ? 'OK' : problems + ' problem(s)'} ===`);
process.exit(problems > 0 ? 1 : 0);
