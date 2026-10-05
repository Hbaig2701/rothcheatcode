import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { createSimulationInput, runGrowthSimulation } from '@/lib/calculations';
config({ path: resolve(process.cwd(), '.env.local'), quiet: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const D = (c?: number | null) => c == null ? 'n/a' : '$' + Math.round(c / 100).toLocaleString();

(async () => {
  const id = process.argv[2] ?? '4eaba0c8-fe2e-43f0-893a-8743e7ac94bc';
  const { data: client } = await admin.from('clients').select('*').eq('id', id).maybeSingle();
  if (!client) { console.log('no client'); return; }
  let cp: any = null;
  if (client.custom_product_id) {
    const { data } = await admin.from('custom_products').select('*').eq('id', client.custom_product_id).maybeSingle();
    cp = data;
  }
  console.log('client', client.id, client.name, '| blueprint', client.blueprint_type, '| product', cp?.product_name ?? client.product_name);
  console.log('withdrawal_type:', client.withdrawal_type, '| withdrawals:', (client.withdrawals ?? []).length, 'entries');
  console.log('non_ssi_income:', JSON.stringify(client.non_ssi_income));

  const r = runGrowthSimulation(createSimulationInput(client as any, cp));
  const scen: Array<[string, any[]]> = [['FORMULA (strategy)', r.formula], ['BASELINE', r.baseline]];
  for (const [label, rows] of scen) {
    console.log(`\n=== ${label} ===`);
    console.log('yr   age  otherIncome    ssIncome     taxableSS    distIRA/conv   iraWithdrawal  rothWd     agi          taxable      totalTax');
    for (const y of rows.slice(0, 24) as any[]) {
      console.log(
        `${y.year} ${String(y.age).padEnd(4)} ${D(y.otherIncome).padStart(12)} ${D(y.ssIncome).padStart(12)} ${D(y.taxableSS).padStart(12)} ${D(y.conversionAmount).padStart(13)} ${D(y.iraWithdrawal).padStart(14)} ${D(y.rothWithdrawal).padStart(10)} ${D(y.agi).padStart(12)} ${D(y.taxableIncome).padStart(12)} ${D(y.totalTax).padStart(12)}`
      );
    }
  }
  // Also dump raw keys of first formula row to spot income-ish fields
  console.log('\nFORMULA row0 keys:', Object.keys(r.formula[0] as any).join(', '));
  console.log('\nBASELINE row0 keys:', Object.keys(r.baseline[0] as any).join(', '));
})();
