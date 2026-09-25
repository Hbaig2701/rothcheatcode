import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { runSimulation, createSimulationInput } from '../lib/calculations/engine';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const d = (n: number) => '$' + Math.round((n ?? 0) / 100).toLocaleString();
const heirRate = 0.40;
const legacy = (y: any) => Math.round(y.traditionalBalance * (1 - heirRate)) + (y.rothBalance || 0) + Math.max(0, y.taxableBalance || 0);

function run(client: any) {
  const { baseline, formula } = runSimulation(createSimulationInput(client, null));
  return { baseline, formula };
}

(async () => {
  // ---- TEST 1: Marc (full conversion, pay-from-IRA, $0 taxable) → strategy UNCHANGED ----
  const { data: marc } = await admin.from('clients').select('*').eq('id', 'e7ff3bfa-ede4-4a42-b8f0-ff65ffcfc120').single();
  const { formula: marcStrat } = run(marc as any);
  const marcFin = marcStrat[marcStrat.length - 1];
  const marcStratTaxableNonZero = marcStrat.some((y) => (y.taxableBalance ?? 0) !== 0);
  console.log('TEST 1 — Marc (full conversion, pay-from-IRA):');
  console.log(`  strategy final: roth ${d(marcFin.rothBalance)} taxable ${d(marcFin.taxableBalance)} legacy ${d(legacy(marcFin))}`);
  console.log(`  strategy taxable ever non-zero? ${marcStratTaxableNonZero ? '⚠️ CHANGED' : '✅ still $0 (unchanged — full conversion has no RMD/external tax)'}`);

  // ---- TEST 2: partial conversion, reinvested, EXTERNAL tax → symmetry ----
  const partial: any = {
    name: 'Partial', filing_status: 'married_filing_jointly', age: 68, spouse_age: 66, end_age: 95,
    qualified_account_value: 200_000_000, roth_ira: 0, taxable_accounts: 0,
    growth_rate: 6, baseline_comparison_rate: 6, rate_of_return: 6,
    state: 'NJ', state_tax_rate: 10.75,
    ss_self: 3_500_000, ss_spouse: 2_640_000, ssi_payout_age: 65, ssi_annual_amount: 3_500_000,
    rmd_treatment: 'reinvested', tax_payment_source: 'external',
    conversion_type: 'fixed_amount', fixed_conversion_amount: 5_000_000,
    max_tax_rate: 24, constraint_type: 'bracket_ceiling', non_ssi_income: [],
  };
  const { baseline: pb, formula: pf } = run(partial);
  console.log('\nTEST 2 — partial conversion, reinvested, external tax:');
  console.log('  age | base.rmd  base.taxable | strat.rmd strat.taxable strat.growth | base.legacy strat.legacy');
  let anyNeg = false;
  for (let i = 0; i < pb.length; i++) {
    const b = pb[i]; const s = pf.find((f) => f.year === b.year);
    if (!s) continue;
    if ((s.taxableBalance ?? 0) < 0 || (b.taxableBalance ?? 0) < 0) anyNeg = true;
    if (b.age < 75 || b.age > 88) continue;
    console.log(`  ${b.age}  | ${d(b.rmdAmount).padEnd(8)} ${d(b.taxableBalance).padEnd(12)} | ${d(s.rmdAmount).padEnd(8)} ${d(s.taxableBalance).padEnd(12)} ${d(s.taxableGrowth ?? 0).padEnd(10)} | ${d(legacy(b)).padEnd(11)} ${d(legacy(s))}`);
  }
  const pfFin = pf[pf.length - 1];
  console.log(`  strategy final taxable: ${d(pfFin.taxableBalance)} (was $1,865,598 pre-fix; should be HIGHER now — no longer dragged by SS/other tax)`);
  console.log(`  no negative balances: ${anyNeg ? '❌' : '✅'}`);

  // ---- TEST 3: symmetry check — identical client, compare per-RMD-dollar accumulation ----
  // For a NON-converting strategy with NO product bonus, strategy MUST equal
  // baseline exactly (same IRA, same RMDs, same reinvestment). bonus_percent:0
  // strips the FIA premium bonus so the only thing under test is the RMD/tax
  // accounting we just changed.
  const noConvert = { ...partial, bonus_percent: 0, max_tax_rate: 0, conversion_type: 'fixed_amount', fixed_conversion_amount: 0 };
  const { baseline: nb, formula: nf } = run(noConvert);
  let maxDiff = 0; let diffAge = 0;
  for (let i = 0; i < nb.length; i++) {
    const b = nb[i]; const s = nf.find((f) => f.year === b.year); if (!s) continue;
    const diff = Math.abs((b.taxableBalance ?? 0) - (s.taxableBalance ?? 0));
    if (diff > maxDiff) { maxDiff = diff; diffAge = b.age; }
  }
  console.log('\nTEST 3 — zero-conversion strategy MUST equal baseline (pure symmetry check):');
  console.log(`  max taxable-balance divergence baseline vs strategy: ${d(maxDiff)} (at age ${diffAge})`);
  console.log(`  ${maxDiff < 100 ? '✅ SYMMETRIC (within rounding)' : '❌ ASYMMETRIC — investigate'}`);
})();
