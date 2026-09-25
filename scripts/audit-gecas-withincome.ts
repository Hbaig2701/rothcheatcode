import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { createSimulationInput, runGrowthSimulation } from '@/lib/calculations';
config({ path: resolve(process.cwd(), '.env.local'), quiet: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const D = (c?: number | null) => c == null ? '' : Math.round(c / 100).toLocaleString();

(async () => {
  const id = '4eaba0c8-fe2e-43f0-893a-8743e7ac94bc';
  const { data: base } = await admin.from('clients').select('*').eq('id', id).maybeSingle();
  let cp: any = null;
  if (base!.custom_product_id) {
    const { data } = await admin.from('custom_products').select('*').eq('id', base!.custom_product_id).maybeSingle();
    cp = data;
  }

  // Simulate what Gerald describes: $175K in 2026 declining linearly to $150K by 2045 (20 yrs).
  const rows = [];
  for (let i = 0; i < 20; i++) {
    const year = 2026 + i;
    const gross = Math.round((175000 - (25000 * i) / 19) * 100);
    rows.push({ year, age: `${62 + i}/${52 + i}`, type: 'other', gross_taxable: gross, tax_exempt: 0 });
  }
  const client: any = { ...base, non_ssi_income: rows };

  const r = runGrowthSimulation(createSimulationInput(client, cp));
  console.log('=== BASELINE with $175K→$150K other income injected ===');
  console.log('yr    age  OtherInc   SSI       TaxableSS  DistIRA    AGI        TaxableInc  TotalTax');
  for (const y of (r.baseline as any[]).slice(0, 22)) {
    console.log(`${y.year} ${String(y.age).padEnd(4)} ${D(y.otherIncome).padStart(9)} ${D(y.ssIncome).padStart(9)} ${D(y.taxableSS).padStart(10)} ${D(y.totalIRAWithdrawal ?? y.rmdAmount).padStart(10)} ${D(y.agi).padStart(10)} ${D(y.taxableIncome).padStart(11)} ${D(y.totalTax).padStart(10)}`);
  }
  console.log('\n=== STRATEGY with same income ===');
  console.log('yr    age  OtherInc   SSI       TaxableSS  Converted  AGI        TaxableInc  TotalTax');
  for (const y of (r.formula as any[]).slice(0, 22)) {
    console.log(`${y.year} ${String(y.age).padEnd(4)} ${D(y.otherIncome).padStart(9)} ${D(y.ssIncome).padStart(9)} ${D(y.taxableSS).padStart(10)} ${D(y.conversionAmount).padStart(10)} ${D(y.agi).padStart(10)} ${D(y.taxableIncome).padStart(11)} ${D(y.totalTax).padStart(10)}`);
  }
})();
