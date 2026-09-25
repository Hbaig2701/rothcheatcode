import { runSimulation, createSimulationInput } from '../lib/calculations/engine';

const d = (n: number) => '$' + Math.round((n ?? 0) / 100).toLocaleString();
const heirRate = 0.40;
const legacy = (y: any) => Math.round(y.traditionalBalance * (1 - heirRate)) + (y.rothBalance || 0) + Math.max(0, y.taxableBalance || 0);

// Partial conversion: big IRA, small FIXED yearly conversion that will NOT
// drain the IRA before RMD age → strategy retains residual RMDs in reinvested mode.
const client: any = {
  name: 'PartialTest', filing_status: 'married_filing_jointly',
  age: 68, spouse_age: 66, end_age: 95,
  qualified_account_value: 200_000_000, // $2M
  roth_ira: 0, taxable_accounts: 0,
  growth_rate: 6, baseline_comparison_rate: 6, rate_of_return: 6,
  state: 'NJ', state_tax_rate: 10.75,
  ss_self: 3_500_000, ss_spouse: 2_640_000, ssi_payout_age: 65, ssi_annual_amount: 3_500_000,
  rmd_treatment: 'reinvested',
  tax_payment_source: 'external', // pay conversion tax externally
  conversion_type: 'fixed_amount', fixed_conversion_amount: 5_000_000, // only $50k/yr — leaves a big residual
  max_tax_rate: 24, constraint_type: 'bracket_ceiling',
  non_ssi_income: [],
};

const input = createSimulationInput(client, null);
const { baseline, formula } = runSimulation(input);

console.log('PARTIAL conversion ($50k/yr on $2M), reinvested, external tax:');
console.log('  age | base.rmd  base.taxable | strat.rmd strat.taxable | base.legacy strat.legacy diff');
for (let i = 0; i < baseline.length; i++) {
  const b = baseline[i]; const s = formula.find((f) => f.year === b.year);
  if (!b || !s || b.age < 75 || b.age > 88) continue;
  console.log(`  ${b.age}  | ${d(b.rmdAmount).padEnd(8)} ${d(b.taxableBalance).padEnd(12)} | ${d(s.rmdAmount).padEnd(8)} ${d(s.taxableBalance).padEnd(12)} | ${d(legacy(b)).padEnd(11)} ${d(legacy(s)).padEnd(11)} ${d(legacy(s)-legacy(b))}`);
}
const stratRmdYears = formula.filter((f) => (f.rmdAmount ?? 0) > 0);
const totalStratRmd = stratRmdYears.reduce((a, f) => a + (f.rmdAmount ?? 0), 0);
const lastStrat = formula[formula.length-1];
console.log(`\n  strategy residual RMDs: ${stratRmdYears.length} years, total ${d(totalStratRmd)}`);
console.log(`  strategy FINAL taxable: ${d(lastStrat.taxableBalance)}  (if $0 despite ${d(totalStratRmd)} of reinvested RMDs → BUG/asymmetry)`);
