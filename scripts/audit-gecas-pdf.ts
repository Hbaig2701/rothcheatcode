import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { createSimulationInput, runGrowthSimulation } from '@/lib/calculations';
import { getTaxExemptIncomeForYear } from '@/lib/calculations/utils/income';
config({ path: resolve(process.cwd(), '.env.local'), quiet: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const D = (c?: number | null) => c == null ? '' : Math.round(c / 100).toLocaleString();

(async () => {
  const id = process.argv[2] ?? '4eaba0c8-fe2e-43f0-893a-8743e7ac94bc';
  const { data: client } = await admin.from('clients').select('*').eq('id', id).maybeSingle();
  let cp: any = null;
  if (client!.custom_product_id) {
    const { data } = await admin.from('custom_products').select('*').eq('id', client!.custom_product_id).maybeSingle();
    cp = data;
  }
  const r = runGrowthSimulation(createSimulationInput(client as any, cp));

  for (const [label, rows] of [['STRATEGY', r.formula], ['BASELINE', r.baseline]] as Array<[string, any[]]>) {
    const scenario = label === 'BASELINE' ? 'baseline' : 'formula';
    console.log(`\n=== ${label} (PDF Income & Taxes page) ===`);
    console.log('yr    age  DistIRA/Conv   SSI       TaxableSS  TaxNonSSI  AGI        Deduct    TaxableInc  TotalTax   NetAfterTax');
    for (const y of rows as any[]) {
      const distIra = scenario === 'baseline' ? (y.totalIRAWithdrawal ?? y.rmdAmount) : y.conversionAmount;
      const taxExempt = getTaxExemptIncomeForYear(client as any, y.year, 0);
      const payFromIra = scenario === 'formula' && client!.tax_payment_source === 'from_ira';
      const taxesOOP = payFromIra ? (y.irmaaSurcharge ?? 0) : y.totalTax;
      const iraCash = Math.max(y.rmdAmount ?? 0, y.iraWithdrawal ?? 0);
      const net = y.otherIncome + taxExempt + y.ssIncome + iraCash + (y.rothWithdrawal ?? 0) + (y.aumScheduledWithdrawal ?? 0) - taxesOOP;
      console.log(
        `${y.year} ${String(y.age).padEnd(4)} ${D(distIra).padStart(12)} ${D(y.ssIncome).padStart(9)} ${D(y.taxableSS).padStart(10)} ${D(y.otherIncome).padStart(10)} ${D(y.agi).padStart(10)} ${D(y.standardDeduction).padStart(9)} ${D(y.taxableIncome).padStart(11)} ${D(y.totalTax).padStart(10)} ${D(net).padStart(12)}`
      );
    }
  }
})();
