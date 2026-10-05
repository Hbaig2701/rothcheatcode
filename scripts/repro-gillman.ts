import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { runGrowthFormulaScenario } from '../lib/calculations/scenarios/growth-formula';
import { getEffectiveGrowthRiderFee } from '../lib/calculations/resolvers/product-resolver';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
(async () => {
  const { data: db } = await admin.from('clients').select('*').eq('id', 'dd2cc625-2592-4420-a475-fe3275e2e0bd').maybeSingle();
  if (!db) { console.log('no client'); return; }

  // Reconstruct the JULY 6 report scenario: $1.823M deposit, 22% bonus,
  // $300K/yr fixed conversion, High-Bonus Medium-Term Growth (10yr, 0.95% rider).
  const client: any = {
    ...db,
    blueprint_type: 'high-bonus-medium-term-growth',
    qualified_account_value: 182300000, // $1,823,000 in cents
    traditional_ira: 182300000,
    bonus_percent: 22,
    surrender_years: 10,
    fixed_conversion_amount: 30000000, // $300,000
    conversion_type: 'fixed_amount',
    rate_of_return: 6,
  };
  const riderFee = getEffectiveGrowthRiderFee(client.blueprint_type, null);
  console.log('blueprint:', client.blueprint_type, '| rider fee:', (riderFee * 100).toFixed(3) + '%', '| bonus:', client.bonus_percent + '%', '| surrender:', client.surrender_years);
  console.log('starting balance (with bonus): $' + Math.round(1823000 * 1.22).toLocaleString());

  const results = runGrowthFormulaScenario(client, 2026, 20, null);
  console.log('\nYear  Age   IRA(EOY)$      Roth(EOY)$     Converted$   RiderFee$');
  let totalFee = 0;
  for (const r of results as any[]) {
    const fee = r.riderFee ?? 0; totalFee += fee;
    const usd = (c: number) => '$' + Math.round((c ?? 0) / 100).toLocaleString();
    console.log(`${r.year}  ${String(r.age).padEnd(4)} ${usd(r.traditionalBalance).padStart(13)} ${usd(r.rothBalance).padStart(14)} ${usd(r.conversionAmount).padStart(12)} ${usd(fee).padStart(11)}`);
  }
  console.log('\nTOTAL RIDER FEE over projection: $' + Math.round(totalFee / 100).toLocaleString());
})();
