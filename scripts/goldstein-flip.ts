import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { runGrowthSimulation, createSimulationInput } from '../lib/calculations';
import type { Client } from '../lib/types/client';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const usd = (c:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(c/100);
(async()=>{
  const {data}=await admin.from('clients').select('*').eq('id','cb7a54be-0098-4a87-b6da-e5b6b009a72c').single();
  const c=data as Client; const hr=((c as any).heir_tax_rate??40)/100;
  console.log('Does strategy gross dip below baseline at LOW growth + BIGGER balance?');
  console.log('bal     rate | base gross    strat gross   grossDiff (neg = strat lower)');
  for (const bal of [100000000,150000000,200000000]) for (const rate of [3,4]) {
    const c2={...c,qualified_account_value:bal,rate_of_return:rate,baseline_comparison_rate:rate,post_contract_rate:rate} as Client;
    const r=runGrowthSimulation(createSimulationInput(c2,null));
    const b=r.baseline[r.baseline.length-1] as any, f=r.formula[r.formula.length-1] as any;
    console.log(usd(bal).padStart(9),`${rate}% |`,usd(b.netWorth).padStart(12),usd(f.netWorth).padStart(12),usd(f.netWorth-b.netWorth).padStart(12));
  }
})();
