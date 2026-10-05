import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { runSimulation, createSimulationInput } from '../lib/calculations/engine';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const d = (n: number) => '$' + Math.round((n ?? 0) / 100).toLocaleString();
const heirRate = 0.40;
const legacy = (y: any) => Math.round(y.traditionalBalance * (1 - heirRate)) + (y.rothBalance || 0) + Math.max(0, y.taxableBalance || 0);

(async () => {
  const { data: client } = await admin.from('clients').select('*').eq('id', 'e7ff3bfa-ede4-4a42-b8f0-ff65ffcfc120').single();
  console.log(`${client!.name}: rmd_treatment=${client!.rmd_treatment}, conversion_type=${client!.conversion_type}, end_age=${client!.end_age}`);

  const input = createSimulationInput(client as any, null);
  const { baseline, formula } = runSimulation(input);

  console.log('\nBASELINE vs STRATEGY taxable + RMD (RMD-phase, ages 73-85):');
  console.log('  age  | base.rmd  base.taxable | strat.rmd strat.taxable | base.legacy  strat.legacy  diff');
  for (let i = 0; i < baseline.length; i++) {
    const b = baseline[i]; const s = formula.find((f) => f.year === b.year);
    if (!b || !s || b.age < 73 || b.age > 85) continue;
    const bl = legacy(b), sl = legacy(s);
    console.log(`  ${b.age}   | ${d(b.rmdAmount).padEnd(8)} ${d(b.taxableBalance).padEnd(12)} | ${d(s.rmdAmount).padEnd(8)} ${d(s.taxableBalance).padEnd(12)} | ${d(bl).padEnd(11)} ${d(sl).padEnd(12)} ${d(sl - bl)}`);
  }

  const bFin = baseline[baseline.length - 1], sFin = formula[formula.length - 1];
  console.log(`\nFinal year (age ${bFin.age}):`);
  console.log(`  baseline:  trad ${d(bFin.traditionalBalance)} roth ${d(bFin.rothBalance)} taxable ${d(bFin.taxableBalance)} → net legacy ${d(legacy(bFin))}`);
  console.log(`  strategy:  trad ${d(sFin.traditionalBalance)} roth ${d(sFin.rothBalance)} taxable ${d(sFin.taxableBalance)} → net legacy ${d(legacy(sFin))}`);
  console.log(`  strategy advantage: ${d(legacy(sFin) - legacy(bFin))}`);
  const stratHasRmd = formula.some((f) => (f.rmdAmount ?? 0) > 0);
  console.log(`\n  strategy has residual RMDs? ${stratHasRmd ? 'YES → asymmetry is LIVE for this client' : 'NO (fully converts before RMDs) → asymmetry does NOT manifest'}`);
})();
