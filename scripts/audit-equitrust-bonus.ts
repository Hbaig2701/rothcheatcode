/**
 * Validate: anniversary bonus follows the Roth conversion for EquiTrust
 * (phased-bonus-growth) only. Run before/after via git stash of growth-formula.ts.
 *   npx tsx scripts/audit-equitrust-bonus.ts
 */
import { runGrowthFormulaScenario } from '../lib/calculations/scenarios/growth-formula';
const d = (n?: number) => '$' + Math.round((n ?? 0) / 100).toLocaleString();
const g = (c: any) => runGrowthFormulaScenario(c, 2026, (c.end_age - c.age), null);

const base = {
  filing_status: 'single', state: 'TX', state_tax_rate: 0,
  roth_ira: 0, taxable_accounts: 50_000_000, ss_self: 0, rmd_treatment: 'spent',
  non_ssi_income: [], growth_rate: 7, baseline_comparison_rate: 7, rate_of_return: 7,
  max_tax_rate: 24, tax_payment_source: 'external', constraint_type: 'bracket_ceiling',
};

// T1: EquiTrust, FULL conversion in year 1, no external Roth. The 4% should now
// keep crediting on the converted Roth for years 1-3.
const t1 = { ...base, blueprint_type: 'phased-bonus-growth', age: 60, end_age: 80,
  qualified_account_value: 100_000_000, conversion_type: 'full_conversion' };

// T2: byte-identical guard — generic 'fia' with a client-set anniversary bonus
// (flag OFF, so mirror bonus must be 0 → identical pre/post).
const t2 = { ...base, blueprint_type: 'fia', age: 60, end_age: 80,
  qualified_account_value: 100_000_000, conversion_type: 'fixed_amount',
  fixed_conversion_amount: 20_000_000, anniversary_bonus_percent: 4, anniversary_bonus_years: 3 };

// T3: EquiTrust WITH a $500K pre-existing external Roth + $100K/yr conversion.
// The external $500K must NOT get the bonus — only the converted (mirror) money.
const t3 = { ...base, blueprint_type: 'phased-bonus-growth', age: 60, end_age: 80,
  qualified_account_value: 100_000_000, roth_ira: 50_000_000,
  conversion_type: 'fixed_amount', fixed_conversion_amount: 10_000_000 };

function dump(label: string, c: any) {
  const rows = g(c);
  const fin = rows[rows.length - 1];
  const nw = (r: any) => (r.traditionalBalance ?? 0) + (r.rothBalance ?? 0) + Math.max(0, r.taxableBalance ?? 0);
  console.log(`\n=== ${label} ===`);
  for (const r of rows.filter((x: any) => x.age <= c.age + 4)) {
    console.log(`  age ${r.age}: conv=${d(r.conversionAmount)} trad=${d(r.traditionalBalance)} roth=${d(r.rothBalance)} bonus=${d(r.productBonusApplied)} rothGrowth=${d(r.rothGrowth)}`);
  }
  console.log(`  FINAL age ${fin.age}: roth=${d(fin.rothBalance)} NW=${d(nw(fin))}`);
  console.log(`  JSON ${JSON.stringify({ l: label, finRoth: fin.rothBalance, finNW: nw(fin),
    y0bonus: rows[0].productBonusApplied, y1bonus: rows[1]?.productBonusApplied })}`);
}
dump('T1 EquiTrust full-conv yr1 (bonus should follow)', t1);
dump('T2 fia + client anniv bonus (flag OFF → must be identical)', t2);
dump('T3 EquiTrust + $500K external Roth (external excluded)', t3);
