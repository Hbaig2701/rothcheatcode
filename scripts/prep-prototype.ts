/** Prototype: render Pre-Meeting Prep for real clients of different shapes. */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv'; import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
import { runGrowthSimulation, runSimulation, createSimulationInput } from '../lib/calculations';
import { runGuaranteedIncomeSimulation } from '../lib/calculations/guaranteed-income/engine';
import { engineFor } from '../lib/calculations/__tests__/audit/factory';
import { analyzeBreakEven } from '../lib/calculations/analysis/breakeven';
import { analyzeWidowPenaltyFromProjection } from '../lib/calculations/analysis/widow-penalty';
import { applyHeldBackIraRmd } from '../lib/calculations/utils/held-back-ira';
import { resolveQlacSides, applyQlacToResult } from '../lib/calculations/utils/qlac';
import { buildPrepSheet, renderText } from '../lib/prep';
import { transformToChartData } from '../lib/calculations/transforms';
import type { Client } from '../lib/types/client';
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {auth:{autoRefreshToken:false,persistSession:false}});

function run(c: Client) {
  const e = engineFor(c);
  const forSim = applyHeldBackIraRmd(c);
  const { baselineClient, strategyClient, qlacStrategyOnly } = resolveQlacSides(forSim);
  const go = (x: Client) => e==='gi' ? runGuaranteedIncomeSimulation(createSimulationInput(x))
    : e==='growth' ? runGrowthSimulation(createSimulationInput(x)) : runSimulation(createSimulationInput(x));
  const res: any = go(strategyClient);
  if (qlacStrategyOnly) res.baseline = go(baselineClient).baseline;
  applyQlacToResult(c, res);
  return res;
}

(async () => {
  const want = process.argv.slice(2);
  const { data: all } = await admin.from('clients').select('*');
  const list = (all ?? []) as Client[];
  const pick = (label: string, f: (c: Client) => boolean) => {
    const c = list.find(f);
    return c ? { label, c } : null;
  };
  const picks = [
    pick('A — classic pre-RMD optimized case', c => engineFor(c)==='growth' && c.conversion_type==='optimized_amount'
      && (c.age??0) < 70 && (c.qualified_account_value??0) > 80_000_000 && !c.widow_analysis),
    pick('B — already past 73, no runway left', c => engineFor(c)==='growth' && (c.age??0) >= 75
      && (c.qualified_account_value??0) > 50_000_000 && c.conversion_type !== 'no_conversion'),
    pick('C — married, widow analysis on', c => engineFor(c)==='growth' && c.widow_analysis === true
      && c.filing_status==='married_filing_jointly' && (c.qualified_account_value??0) > 100_000_000),
    pick('D — guaranteed income product', c => engineFor(c)==='gi' && (c.qualified_account_value??0) > 50_000_000),
  ].filter(Boolean) as {label:string;c:Client}[];

  for (const { label, c } of picks) {
    if (want.length && !want.some(w => label.startsWith(w))) continue;
    let res;
    try { res = run(c); } catch (err) { console.log(`\n### ${label}: ENGINE ERROR ${(err as Error).message}`); continue; }
    const be = analyzeBreakEven(res.baseline, res.formula, c.heir_tax_rate ?? 40);
    let widow: number | null = null;
    if (c.widow_analysis && c.filing_status === 'married_filing_jointly') {
      try { widow = analyzeWidowPenaltyFromProjection({ client: c, formulaYears: res.formula }).totalAdditionalTax; } catch {}
    }
    const legacySeries = transformToChartData(
      { baseline: res.baseline, formula: res.formula } as any, (c.heir_tax_rate ?? 40) / 100,
    ).map((p: any) => ({ age: p.age, baseline: p.baseline, formula: p.formula }));
    const out = buildPrepSheet({ client: c, engine: engineFor(c), baseline: res.baseline, formula: res.formula,
      taxPaybackAge: be.simpleBreakEven ?? null, legacySeries, widowExtraTax: widow });
    console.log(`\n\n######## ${label}  [${engineFor(c)} engine · ${c.conversion_type}] ########\n`);
    if (!out.supported) { console.log('  NO BRIEF: ' + out.reason); continue; }
    console.log(renderText(out.sheet));
  }
})();
