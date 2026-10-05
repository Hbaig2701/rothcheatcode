import { runBaselineScenario } from '../lib/calculations/scenarios/baseline';
import { runGrowthFormulaScenario } from '../lib/calculations/scenarios/growth-formula';

const d = (n: number) => '$' + Math.round((n ?? 0) / 100).toLocaleString();
const heirRate = 0.40;
const legacy = (y: any) => Math.round(y.traditionalBalance * (1 - heirRate)) + (y.rothBalance || 0) + Math.max(0, y.taxableBalance || 0);

function base(c: any) { return runBaselineScenario(c, 2026, (c.end_age - c.age)); }
function growth(c: any) { return runGrowthFormulaScenario(c, 2026, (c.end_age - c.age), null); }

const common = {
  filing_status: 'married_filing_jointly', age: 68, spouse_age: 66, end_age: 95,
  qualified_account_value: 200_000_000, roth_ira: 0, taxable_accounts: 0,
  state: 'NJ', state_tax_rate: 10.75,
  ss_self: 3_500_000, ss_spouse: 2_640_000, ssi_payout_age: 65, ssi_annual_amount: 3_500_000,
  rmd_treatment: 'reinvested', non_ssi_income: [],
  // rate == comparison rate so the apples-to-apples symmetry test is valid
  growth_rate: 6, baseline_comparison_rate: 6, rate_of_return: 6,
  product_name: 'fia', carrier_name: 'Generic',
};

// TEST A: bonus 0, ZERO conversion → growth strategy taxable MUST equal baseline.
const noConv: any = { ...common, bonus_percent: 0, anniversary_bonus_percent: 0,
  conversion_type: 'fixed_amount', fixed_conversion_amount: 0, max_tax_rate: 0,
  constraint_type: 'bracket_ceiling', tax_payment_source: 'external' };
{
  const b = base(noConv), g = growth(noConv);
  let maxDiff = 0, diffAge = 0;
  for (const by of b) { const gy = g.find((x) => x.year === by.year); if (!gy) continue;
    const diff = Math.abs((by.taxableBalance ?? 0) - (gy.taxableBalance ?? 0));
    if (diff > maxDiff) { maxDiff = diff; diffAge = by.age; } }
  console.log('TEST A — Growth FIA, bonus 0, zero conversion → MUST equal baseline:');
  console.log(`  max taxable divergence: ${d(maxDiff)} at age ${diffAge}  ${maxDiff < 100 ? '✅ SYMMETRIC' : '❌ ASYMMETRIC'}`);
}

// TEST B: partial conversion, reinvested, external tax → accumulates, no negatives.
const partial: any = { ...common, bonus_percent: 20, anniversary_bonus_percent: 0,
  conversion_type: 'fixed_amount', fixed_conversion_amount: 5_000_000, max_tax_rate: 24,
  constraint_type: 'bracket_ceiling', tax_payment_source: 'external' };
{
  const b = base(partial), g = growth(partial);
  let anyNeg = false; let mono = true; let prev = -1;
  const gRmdYears = g.filter((y) => (y.rmdAmount ?? 0) > 0);
  for (const gy of g) { if ((gy.taxableBalance ?? 0) < 0) anyNeg = true; }
  for (const gy of gRmdYears) { if ((gy.taxableBalance ?? 0) < prev - 1) mono = false; prev = gy.taxableBalance ?? 0; }
  const gFin = g[g.length - 1];
  console.log('\nTEST B — Growth FIA, partial conversion, reinvested, external tax:');
  console.log(`  strategy residual RMD years: ${gRmdYears.length}, final taxable: ${d(gFin.taxableBalance)}, final legacy: ${d(legacy(gFin))}`);
  console.log(`  no negatives: ${anyNeg ? '❌' : '✅'} | taxable monotonic in RMD phase: ${mono ? '✅' : '❌'}`);
  console.log('  sample (age, strat.rmd, strat.taxable, strat.taxGrow):');
  for (const gy of g.filter((y) => y.age >= 78 && y.age <= 84)) {
    console.log(`    ${gy.age}: ${d(gy.rmdAmount)}  ${d(gy.taxableBalance)}  ${d(gy.taxableGrowth ?? 0)}`);
  }
}

// TEST C: full conversion (aggressive) → strategy drains IRA, taxable handling sane.
const full: any = { ...common, bonus_percent: 20, conversion_type: 'optimized_amount',
  max_tax_rate: 32, constraint_type: 'bracket_ceiling', tax_payment_source: 'from_ira' };
{
  const g = growth(full);
  const gFin = g[g.length - 1];
  const anyNeg = g.some((y) => (y.taxableBalance ?? 0) < 0 || (y.netWorth ?? 0) < 0);
  console.log('\nTEST C — Growth FIA, full conversion, pay-from-IRA:');
  console.log(`  final: roth ${d(gFin.rothBalance)} trad ${d(gFin.traditionalBalance)} taxable ${d(gFin.taxableBalance)}  no negatives: ${anyNeg ? '❌' : '✅'}`);
}
