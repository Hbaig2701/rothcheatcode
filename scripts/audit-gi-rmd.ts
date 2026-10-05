/**
 * Validate the GI-engine RMD recognition fix (Bug #3).
 * Runs every GI client through the real GI simulation and reports:
 *   - crashes / NaN / Infinity / negative balances
 *   - whether conversion-phase RMDs are now recognized for 73+ clients
 *   - baseline + strategy final legacy (for before/after git-stash diff)
 * Run: npx tsx scripts/audit-gi-rmd.ts
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv'; import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
import { runGuaranteedIncomeSimulation, createSimulationInput } from '../lib/calculations';
import { isGuaranteedIncomeProduct } from '../lib/config/products';

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const d = (n?: number) => '$' + Math.round((n ?? 0) / 100).toLocaleString();

(async () => {
  const { data: clients } = await admin.from('clients').select('*');
  const { data: customs } = await admin.from('custom_products').select('*');
  const customById = new Map((customs ?? []).map((c: any) => [c.id, c]));

  const gi = (clients ?? []).filter((c: any) => c.blueprint_type && isGuaranteedIncomeProduct(c.blueprint_type));
  const out: any[] = [];
  for (const c of gi) {
    const cp = c.custom_product_id ? customById.get(c.custom_product_id) ?? null : null;
    try {
      const res = runGuaranteedIncomeSimulation(createSimulationInput(c as any, cp as any));
      const strat = res.formula ?? [];
      const base = res.baseline ?? [];
      const bad = (rows: any[]) => rows.some((r: any) =>
        [r.traditionalBalance, r.rothBalance, r.taxableBalance, r.netWorth].some((v: number) =>
          v == null || Number.isNaN(v) || !Number.isFinite(v) || v < -1));
      const convRmdYears = strat.filter((r: any) => r.giPhase === 'conversion' && (r.rmdAmount ?? 0) > 0).length;
      const finS = strat[strat.length - 1]; const finB = base[base.length - 1];
      const nw = (r: any) => (r?.traditionalBalance ?? 0) + (r?.rothBalance ?? 0) + Math.max(0, r?.taxableBalance ?? 0);
      out.push({ name: c.name, age: c.age, src: c.tax_payment_source, convYears: c.gi_conversion_years,
        badStrat: bad(strat), badBase: bad(base), convRmdYears,
        stratFinalNW: nw(finS), baseFinalNW: nw(finB) });
    } catch (e: any) {
      out.push({ name: c.name, age: c.age, error: e.message });
    }
  }
  console.log(`GI clients: ${gi.length}`);
  for (const o of out) {
    if (o.error) { console.log(`  ❌ ${o.name} (age ${o.age}): THREW ${o.error}`); continue; }
    const flag = (o.badStrat || o.badBase) ? '❌NEG/NaN' : '✅';
    console.log(`  ${flag} ${o.name} (age ${o.age}, ${o.src}, ${o.convYears}yr): convRmdYears=${o.convRmdYears} stratNW=${d(o.stratFinalNW)} baseNW=${d(o.baseFinalNW)}`);
    // machine-diffable
    console.log(`     JSON ${JSON.stringify({ n: o.name, crmd: o.convRmdYears, s: o.stratFinalNW, b: o.baseFinalNW })}`);
  }
})();
