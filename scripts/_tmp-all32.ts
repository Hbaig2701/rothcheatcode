import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { runGrowthSimulation, runSimulation, createSimulationInput } from '../lib/calculations';
import type { Client } from '../lib/types/client';
import { isGuaranteedIncomeProduct, type FormulaType } from '../lib/config/products';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const GROWTH = ['fia','short-term-cap-growth','phased-bonus-growth','vesting-bonus-growth','high-bonus-long-term-growth','high-bonus-medium-term-growth'];
(async () => {
  const { data } = await admin.from('clients').select('*');
  const affected = (data ?? []).filter((c:any) =>
    c.conversion_type === 'partial_amount' &&
    (c.tax_payment_source === 'from_ira' || (c.taxable_accounts ?? 0) <= 0));
  const out: any[] = [];
  for (const row of affected) {
    const c = row as unknown as Client & Record<string,any>;
    let prod = null;
    if (c.custom_product_id) {
      const { data: p } = await admin.from('custom_products').select('*').eq('id', c.custom_product_id).maybeSingle();
      prod = p;
    }
    try {
      const input = createSimulationInput(c, prod as any);
      const isG = GROWTH.includes(String(c.blueprint_type));
      const res: any = isG ? runGrowthSimulation(input) : runSimulation(input);
      const convs = res.formula.map((r:any)=>r.conversionAmount ?? 0);
      const total = convs.reduce((a:number,b:number)=>a+b,0);
      const target = c.target_partial_amount ?? 0;
      let run=0, yrs=0;
      for (const x of convs) { if (x>0) yrs++; run+=x; if (run>=target) break; }
      const bad = convs.some((x:number)=>!Number.isFinite(x) || x<0);
      out.push({ name: c.name, target, total, yrs, over: total - target, bad });
    } catch (e) { out.push({ name: c.name, err: (e as Error).message.slice(0,60) }); }
  }
  console.log(`ran ${out.length} affected clients`);
  const errs = out.filter(o=>o.err);
  const over = out.filter(o=>!o.err && o.over > 100);   // >$1 overshoot
  const bad  = out.filter(o=>!o.err && o.bad);
  const under= out.filter(o=>!o.err && o.over < -100);
  console.log(`  errors:            ${errs.length}`);
  console.log(`  NaN/negative conv: ${bad.length}`);
  console.log(`  OVERSHOOT target:  ${over.length}`);
  console.log(`  under target:      ${under.length}`);
  for (const o of over) console.log(`     OVER: ${o.name} target=$${(o.target/100).toLocaleString()} total=$${(o.total/100).toLocaleString()}`);
  for (const o of under.slice(0,6)) console.log(`     under: ${o.name} target=$${(o.target/100).toLocaleString()} total=$${(o.total/100).toLocaleString()} (may be IRA/horizon limited)`);
  for (const o of errs) console.log(`     ERR: ${o.name}: ${o.err}`);
  const yrsDist: Record<number,number> = {};
  for (const o of out) if (!o.err) yrsDist[o.yrs] = (yrsDist[o.yrs]??0)+1;
  console.log(`  years-to-target distribution:`, yrsDist);
  process.exit(0);
})();
