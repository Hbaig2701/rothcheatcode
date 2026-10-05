import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

(async () => {
  const { data: c } = await admin.from('clients').select('*').eq('id', 'e7ff3bfa-ede4-4a42-b8f0-ff65ffcfc120').single();
  console.log('Marc Kraus RMD-treatment-related fields:');
  for (const k of Object.keys(c!).filter(k => /rmd|treatment|reinvest|taxable|baseline/i.test(k))) {
    console.log(`  ${k}:`, (c as any)[k]);
  }

  const { data: projs } = await admin.from('projections').select('baseline_years').eq('client_id', c!.id).order('created_at', { ascending: false }).limit(1);
  const years = (projs?.[0]?.baseline_years ?? []) as any[];
  console.log('\nBaseline years (RMD onset, ages 72-80) — $ values:');
  console.log('  age  year   rmdAmount   taxableBalance  netWorth');
  for (const y of years.filter(y => y.age >= 72 && y.age <= 80)) {
    const d = (n: number) => '$' + Math.round((n ?? 0) / 100).toLocaleString();
    console.log(`  ${y.age}   ${y.year}   ${d(y.rmdAmount).padEnd(11)} ${d(y.taxableBalance).padEnd(14)} ${d(y.netWorth)}`);
  }
})();
