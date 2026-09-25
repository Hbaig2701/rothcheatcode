import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { runGrowthFormulaScenario } from '../lib/calculations/scenarios/growth-formula';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
(async () => {
  const { data: client } = await admin.from('clients').select('*').eq('id', 'e9490406-a07d-4892-bb9b-a282760bf303').maybeSingle();
  if (!client) return;
  const r = runGrowthFormulaScenario(client as any, 2026, client.projection_years ?? 21, null) as any[];
  const usd = (c: number) => '$' + Math.round((c ?? 0) / 100).toLocaleString();
  let tConv = 0, tFromIra = 0, tTotal = 0, tRmdTax = 0, tOrdTax = 0, tSSTax = 0;
  console.log('Age  ConvTax(pg5)  TaxFromIRA(pg8)  TotalTax  FedOnConv  FedOnOrd  FedOnSS  RMD');
  for (const y of r) {
    const convTax = (y.federalTaxOnConversions ?? 0) + (y.stateTaxOnConversions ?? 0);
    const fromIra = y.taxesPaidFromIRA ?? 0;
    const ordTax = (y.federalTaxOnOrdinaryIncome ?? 0) + (y.stateTaxOnOrdinaryIncome ?? 0);
    const ssTax = (y.federalTaxOnSS ?? 0) + (y.stateTaxOnSS ?? 0);
    tConv += convTax; tFromIra += fromIra; tTotal += y.totalTax ?? 0; tOrdTax += ordTax; tSSTax += ssTax;
    if (convTax || fromIra) console.log(
      `${String(y.age).padEnd(4)} ${usd(convTax).padStart(12)} ${usd(fromIra).padStart(15)} ${usd(y.totalTax).padStart(9)} ${usd(y.federalTaxOnConversions).padStart(10)} ${usd(y.federalTaxOnOrdinaryIncome).padStart(9)} ${usd(y.federalTaxOnSS).padStart(8)} ${usd(y.rmdAmount).padStart(11)}`
    );
  }
  console.log('\n=== TOTALS ===');
  console.log('Page 5  Conversion Tax (fed+state on conversions): ' + usd(tConv));
  console.log('Page 8  Tax from IRA (taxesPaidFromIRA):           ' + usd(tFromIra));
  console.log('        Gap (pg8 - pg5):                           ' + usd(tFromIra - tConv));
  console.log('        Total tax bill (all years):                ' + usd(tTotal));
  console.log('        Fed+state tax on ORDINARY income (all yrs):' + usd(tOrdTax));
  console.log('        Fed+state tax on SS (all yrs):             ' + usd(tSSTax));
})();

// --- confirm gross-up hypothesis ---
(async () => {
  const { data: client } = await admin.from('clients').select('*').eq('id', 'e9490406-a07d-4892-bb9b-a282760bf303').maybeSingle();
  const r = runGrowthFormulaScenario(client as any, 2026, client.projection_years ?? 21, null) as any[];
  const usd = (c: number) => '$' + Math.round((c ?? 0)/100).toLocaleString();
  let tExt = 0;
  console.log('\nAge  ConvAmt   TaxFromIRA  ExtraPull(=IRAwd-conv-RMDcredit?)  totalIRAwd  ExternalTax');
  for (const y of r) {
    if (!(y.conversionAmount > 0)) continue;
    tExt += y.taxesPaidExternally ?? 0;
    console.log(`${String(y.age).padEnd(4)} ${usd(y.conversionAmount).padStart(10)} ${usd(y.taxesPaidFromIRA).padStart(11)} ${usd(y.totalIRAWithdrawal).padStart(12)} ${usd(y.taxesPaidExternally).padStart(12)}`);
  }
  console.log('Total taxesPaidExternally:', usd(tExt));
})();
