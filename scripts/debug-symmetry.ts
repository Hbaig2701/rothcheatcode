import { runSimulation, createSimulationInput } from '../lib/calculations/engine';

const d = (n: number) => '$' + Math.round((n ?? 0) / 100).toLocaleString();

const c: any = {
  name: 'NoConv', filing_status: 'married_filing_jointly', age: 68, spouse_age: 66, end_age: 95,
  qualified_account_value: 200_000_000, roth_ira: 0, taxable_accounts: 0,
  growth_rate: 6, baseline_comparison_rate: 6, rate_of_return: 6,
  state: 'NJ', state_tax_rate: 10.75,
  ss_self: 3_500_000, ss_spouse: 2_640_000, ssi_payout_age: 65, ssi_annual_amount: 3_500_000,
  rmd_treatment: 'reinvested', tax_payment_source: 'external',
  conversion_type: 'fixed_amount', fixed_conversion_amount: 0,
  max_tax_rate: 0, constraint_type: 'bracket_ceiling', non_ssi_income: [],
};

const { baseline, formula } = runSimulation(createSimulationInput(c, null));
console.log('age | b.trad     s.trad     | b.rmd    s.rmd    | b.conv s.conv | b.taxable   s.taxable   | b.fedTax  s.fedTax | b.taxGrow s.taxGrow | Δtaxable');
for (let i = 0; i < baseline.length; i++) {
  const b = baseline[i]; const s = formula.find((f) => f.year === b.year)!;
  if (b.age < 72 || b.age > 80) continue;
  const dt = (b.taxableBalance ?? 0) - (s.taxableBalance ?? 0);
  console.log(`${b.age}  | ${d(b.traditionalBalance).padEnd(10)} ${d(s.traditionalBalance).padEnd(10)} | ${d(b.rmdAmount).padEnd(8)} ${d(s.rmdAmount).padEnd(8)} | ${d(b.conversionAmount).padEnd(6)} ${d(s.conversionAmount).padEnd(6)} | ${d(b.taxableBalance).padEnd(11)} ${d(s.taxableBalance).padEnd(11)} | ${d(b.federalTax).padEnd(9)} ${d(s.federalTax).padEnd(8)} | ${d(b.taxableGrowth ?? 0).padEnd(8)} ${d(s.taxableGrowth ?? 0).padEnd(8)} | ${d(dt)}`);
}
