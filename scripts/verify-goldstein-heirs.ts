import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { runGrowthSimulation, createSimulationInput } from '../lib/calculations';
import type { Client } from '../lib/types/client';

config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const usd = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(c / 100);

(async () => {
  const { data: client } = await admin.from('clients').select('*').eq('id', 'cb7a54be-0098-4a87-b6da-e5b6b009a72c').single();
  if (!client) { console.log('no client'); return; }
  const c = client as Client;

  console.log('=== KEY INPUTS (current DB) ===');
  console.log('name:', c.name, '| product:', c.product_name, '| blueprint_type:', (c as any).blueprint_type);
  console.log('qualified_account_value:', usd((c as any).qualified_account_value ?? 0));
  console.log('rate_of_return:', (c as any).rate_of_return, '| bonus_percent:', (c as any).bonus_percent);
  console.log('conversion_type:', (c as any).conversion_type, '| fixed_conversion_amount:', usd((c as any).fixed_conversion_amount ?? 0));
  console.log('tax_payment_source:', (c as any).tax_payment_source, '| taxable_accounts:', usd((c as any).taxable_accounts ?? 0));
  console.log('heir_tax_rate:', (c as any).heir_tax_rate, '| aum_allocation_percent:', (c as any).aum_allocation_percent);

  // Replicate the route: no custom product, no AUM split -> straight growth sim.
  const input = createSimulationInput(c, null);
  let result = runGrowthSimulation(input);

  // fundConvTaxFromIraIfShort logic (partial-taxable fallback)
  const taxable = (c as any).taxable_accounts ?? 0;
  if ((c as any).tax_payment_source !== 'from_ira' && taxable > 0) {
    const convTax = result.formula.reduce((s: number, y: any) => s + (y.federalTaxOnConversions ?? 0) + (y.stateTaxOnConversions ?? 0), 0);
    if (convTax > 0 && taxable < convTax) {
      const reRun = runGrowthSimulation(createSimulationInput({ ...c, tax_payment_source: 'from_ira' } as Client, null));
      result = { ...reRun, baseline: result.baseline };
      console.log('\n(fundConvTaxFromIraIfShort: RE-RAN strategy from_ira)');
    }
  }

  const heirTaxRate = ((c as any).heir_tax_rate ?? 40) / 100;
  const lb = result.baseline[result.baseline.length - 1] as any;
  const lf = result.formula[result.formula.length - 1] as any;

  const baseGross = lb.netWorth, baseTrad = lb.traditionalBalance;
  const baseHeirTax = Math.round(baseTrad * heirTaxRate);
  const baseNet = baseGross - baseHeirTax;

  const blueGross = lf.netWorth, blueTrad = lf.traditionalBalance;
  const blueHeirTax = Math.round(blueTrad * heirTaxRate);
  const blueNet = blueGross - blueHeirTax;

  console.log('\n=== HEIRS SECTION (live engine output, current DB values) ===');
  console.log('final year:', lb.year, '| baseline age:', lb.age);
  console.log('                          Baseline        Strategy        Diff');
  console.log('Legacy Distribution   ', usd(baseGross).padStart(14), usd(blueGross).padStart(14), usd(blueGross - baseGross).padStart(14));
  console.log('Tax on Legacy         ', usd(baseHeirTax).padStart(14), usd(blueHeirTax).padStart(14), usd(blueHeirTax - baseHeirTax).padStart(14));
  console.log('Net Legacy            ', usd(baseNet).padStart(14), usd(blueNet).padStart(14), usd(blueNet - baseNet).padStart(14));
  console.log('\nStrategy trad remaining (heir-taxable):', usd(blueTrad));
  console.log('Baseline trad remaining (heir-taxable):', usd(baseTrad), '| baseline taxable brokerage:', usd(lb.taxableBalance ?? 0));
  console.log('\nRELATIONSHIP CHECK:');
  console.log('  gross strategy < gross baseline?', blueGross < baseGross, `(${usd(blueGross - baseGross)})`);
  console.log('  net strategy   > net baseline?  ', blueNet > baseNet, `(+${usd(blueNet - baseNet)})`);

  // Sweep growth rate at $1M premium (to see if strategy gross ever dips below baseline)
  console.log('\n=== $1M premium, sweep rate_of_return (conv $150k/yr, bonus 24%) ===');
  console.log('rate | base gross    strat gross   grossDiff   | base trad(heir-taxable)  strat trad | netDiff');
  for (const rate of [3, 4, 5, 6, 7]) {
    const c2 = { ...c, qualified_account_value: 100000000, rate_of_return: rate, baseline_comparison_rate: rate, post_contract_rate: rate } as Client;
    const r2 = runGrowthSimulation(createSimulationInput(c2, null));
    const b = r2.baseline[r2.baseline.length - 1] as any;
    const f = r2.formula[r2.formula.length - 1] as any;
    const bHT = Math.round(b.traditionalBalance * heirTaxRate), fHT = Math.round(f.traditionalBalance * heirTaxRate);
    const netDiff = (f.netWorth - fHT) - (b.netWorth - bHT);
    console.log(`${rate}%   |`, usd(b.netWorth).padStart(12), usd(f.netWorth).padStart(12), usd(f.netWorth - b.netWorth).padStart(11), '|', usd(b.traditionalBalance).padStart(14), usd(f.traditionalBalance).padStart(10), '|', usd(netDiff).padStart(12));
  }

  // Show how RMDs move buckets (not shrink) in the baseline @ current settings
  console.log('\n=== Baseline bucket movement over time ($750K, 6%) — RMDs reinvested, not lost ===');
  console.log('year  age  traditional     taxable-brokerage   total');
  for (const y of result.baseline as any[]) {
    if ([2026, 2031, 2036, 2041, 2046, 2052].includes(y.year)) {
      console.log(y.year, ' ', String(y.age).padStart(3), usd(y.traditionalBalance).padStart(14), usd(y.taxableBalance ?? 0).padStart(16), usd(y.netWorth).padStart(14));
    }
  }
})();
