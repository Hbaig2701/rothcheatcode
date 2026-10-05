import { runBaselineScenario } from '../lib/calculations/scenarios/baseline';

const d = (n: number) => '$' + Math.round((n ?? 0) / 100).toLocaleString();

// Base synthetic client (cents). MFJ, big outside income (the bug trigger),
// $500k IRA, RMDs at 75.
function makeClient(overrides: any = {}) {
  return {
    name: 'Test', filing_status: 'married_filing_jointly',
    age: 68, spouse_age: 66,
    qualified_account_value: 50_000_000, roth_ira: 0, taxable_accounts: 0,
    growth_rate: 8, baseline_comparison_rate: 8,
    state: 'NJ', state_tax_rate: 10.75,
    ss_self: 3_500_000, ss_spouse: 2_640_000, ssi_payout_age: 65, ssi_annual_amount: 3_500_000,
    rmd_treatment: 'reinvested',
    non_ssi_income: [],
    ...overrides,
  };
}

function summarize(label: string, client: any) {
  const years = runBaselineScenario(client as any, 2026, 30);
  const rmdYears = years.filter((y) => (y.rmdAmount ?? 0) > 0).sort((a, b) => a.age - b.age);
  const first = rmdYears[0];
  const mid = rmdYears[Math.min(4, rmdYears.length - 1)];
  const last = years[years.length - 1];
  // negative check
  const anyNeg = years.some((y) => (y.taxableBalance ?? 0) < 0 || (y.netWorth ?? 0) < 0);
  // monotonic taxable during RMD phase (reinvested/cash should be non-decreasing)
  let monoOk = true;
  for (let i = 1; i < rmdYears.length; i++) if ((rmdYears[i].taxableBalance ?? 0) < (rmdYears[i - 1].taxableBalance ?? 0) - 1) monoOk = false;
  console.log(`\n── ${label} ──`);
  console.log(`  first RMD age ${first?.age}: rmd ${d(first?.rmdAmount ?? 0)} taxable ${d(first?.taxableBalance ?? 0)} netWorth ${d(first?.netWorth ?? 0)}`);
  console.log(`  +5yr  age ${mid?.age}: taxable ${d(mid?.taxableBalance ?? 0)} netWorth ${d(mid?.netWorth ?? 0)}`);
  console.log(`  final age ${last?.age}: traditional ${d(last?.traditionalBalance)} roth ${d(last?.rothBalance)} taxable ${d(last?.taxableBalance)} netWorth ${d(last?.netWorth)}`);
  console.log(`  no negative balances: ${anyNeg ? '❌ NEGATIVE FOUND' : '✅'}  |  taxable monotonic in RMD phase: ${monoOk ? '✅' : '(n/a for spent)'}`);
  return { years, first, last };
}

console.log('============ BASELINE RMD-TREATMENT VERIFICATION ============');

// 1) reinvested + big outside income (the bug case)
summarize('reinvested, big outside income (MFJ)', makeClient({ rmd_treatment: 'reinvested', non_ssi_income: Array.from({length:30},(_,i)=>({year:2026+i, type:'other', gross_taxable:25_000_000, tax_exempt:0})) }));

// 2) cash mode, same
summarize('cash, big outside income (MFJ)', makeClient({ rmd_treatment: 'cash', non_ssi_income: Array.from({length:30},(_,i)=>({year:2026+i, type:'other', gross_taxable:25_000_000, tax_exempt:0})) }));

// 3) spent mode — taxable must stay FLAT at starting value
summarize('spent, big outside income (MFJ)', makeClient({ rmd_treatment: 'spent', taxable_accounts: 10_000_000, non_ssi_income: Array.from({length:30},(_,i)=>({year:2026+i, type:'other', gross_taxable:25_000_000, tax_exempt:0})) }));

// 4) reinvested, NO outside income (only SS + RMD) — should also accumulate, no regression
summarize('reinvested, NO outside income', makeClient({ rmd_treatment: 'reinvested', ss_self: 0, ss_spouse: 0, ssi_annual_amount: 0, non_ssi_income: [] }));

// 5) single filer, reinvested, outside income
summarize('reinvested, SINGLE filer', makeClient({ filing_status: 'single', spouse_age: undefined, ss_spouse: 0, non_ssi_income: Array.from({length:30},(_,i)=>({year:2026+i, type:'other', gross_taxable:15_000_000, tax_exempt:0})) }));

// 6) small IRA that depletes — ensure no negative / no weirdness after depletion
summarize('reinvested, small IRA (depletes)', makeClient({ qualified_account_value: 8_000_000, rmd_treatment: 'reinvested', non_ssi_income: Array.from({length:30},(_,i)=>({year:2026+i, type:'other', gross_taxable:20_000_000, tax_exempt:0})) }));

console.log('\n============ DONE ============');
