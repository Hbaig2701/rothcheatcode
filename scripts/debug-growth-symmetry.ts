import { runBaselineScenario } from '../lib/calculations/scenarios/baseline';
import { runGrowthFormulaScenario } from '../lib/calculations/scenarios/growth-formula';

const d = (n: number) => '$' + Math.round((n ?? 0) / 100).toLocaleString();
const c: any = {
  filing_status: 'married_filing_jointly', age: 68, spouse_age: 66, end_age: 95,
  qualified_account_value: 200_000_000, roth_ira: 0, taxable_accounts: 0,
  state: 'NJ', state_tax_rate: 10.75,
  ss_self: 3_500_000, ss_spouse: 2_640_000, ssi_payout_age: 65, ssi_annual_amount: 3_500_000,
  rmd_treatment: 'reinvested', non_ssi_income: [],
  growth_rate: 6, baseline_comparison_rate: 6, rate_of_return: 6,
  product_name: 'fia', carrier_name: 'Generic',
  bonus_percent: 0, anniversary_bonus_percent: 0,
  conversion_type: 'fixed_amount', fixed_conversion_amount: 0, max_tax_rate: 0,
  constraint_type: 'bracket_ceiling', tax_payment_source: 'external',
};
const b = runBaselineScenario(c, 2026, 27);
const g = runGrowthFormulaScenario(c, 2026, 27, null);
console.log('age | b.trad      g.trad      Δtrad | b.rmd    g.rmd   | b.taxable   g.taxable   Δtax | b.fedTax g.fedTax | b.taxGrow g.taxGrow');
for (const by of b) {
  const gy = g.find((x) => x.year === by.year); if (!gy) continue;
  if (by.age < 73 || by.age > 82) continue;
  console.log(`${by.age}  | ${d(by.traditionalBalance).padEnd(11)} ${d(gy.traditionalBalance).padEnd(11)} ${d((by.traditionalBalance)-(gy.traditionalBalance)).padEnd(6)}| ${d(by.rmdAmount).padEnd(8)} ${d(gy.rmdAmount).padEnd(7)}| ${d(by.taxableBalance).padEnd(11)} ${d(gy.taxableBalance).padEnd(11)} ${d((by.taxableBalance)-(gy.taxableBalance)).padEnd(6)}| ${d(by.federalTax).padEnd(8)} ${d(gy.federalTax).padEnd(8)} | ${d(by.taxableGrowth??0).padEnd(8)} ${d(gy.taxableGrowth??0)}`);
}
