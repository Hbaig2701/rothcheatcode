import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { runGrowthFormulaScenario } from '../lib/calculations/scenarios/growth-formula';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
(async () => {
  const { data: db } = await admin.from('clients').select('*').eq('id', 'dd2cc625-2592-4420-a475-fe3275e2e0bd').maybeSingle();
  if (!db) return;
  // Reconstruct the config the REPORT was generated with ($1.823M, 20% bonus,
  // High-Bonus Medium-Term 0.95% fee, $300K/yr fixed conversion, 35% ceiling).
  const client: any = {
    ...db,
    blueprint_type: 'high-bonus-medium-term-growth',
    qualified_account_value: 182300000,
    traditional_ira: 182300000,
    bonus_percent: 20,
    conversion_type: 'fixed_amount',
    fixed_conversion_amount: 30000000,
    surrender_years: 10,
    max_tax_rate: 35,
    rate_of_return: 6,
  };
  const r = runGrowthFormulaScenario(client, 2026, db.projection_years ?? 20, null) as any[];
  const usd = (c: number) => '$' + Math.round((c ?? 0) / 100).toLocaleString();
  const conv = r.reduce((s, y) => s + (y.conversionAmount ?? 0), 0);
  const convTax = r.reduce((s, y) => s + (y.federalTaxOnConversions ?? 0) + (y.stateTaxOnConversions ?? 0), 0);
  const rider = r.reduce((s, y) => s + (y.riderFee ?? 0), 0);
  const bonus = Math.round(182300000 * 0.20);
  console.log('CURRENT (post-fix) engine on the Report config:');
  console.log('  Roth Conversions:      ' + usd(conv) + '   (Report B: $1,790,077 | Report A: $1,780,661)');
  console.log('  Tax on Conversions:    ' + usd(convTax) + '   (Report B: $470,024 | Report A: $468,824)');
  console.log('  Premium Bonus:         ' + usd(bonus));
  console.log('  Net Out-of-Pocket Tax: ' + usd(convTax - bonus) + '   (Report B: $105,424 | Report A: $104,224)');
  console.log('  Total rider fee:       ' + usd(rider));
})();
