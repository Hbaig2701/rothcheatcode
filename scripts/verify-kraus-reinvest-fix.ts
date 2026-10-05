import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { runBaselineScenario } from '../lib/calculations/scenarios/baseline';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const d = (n: number) => '$' + Math.round((n ?? 0) / 100).toLocaleString();

(async () => {
  const { data: client } = await admin.from('clients').select('*').eq('id', 'e7ff3bfa-ede4-4a42-b8f0-ff65ffcfc120').single();
  console.log(`Client: ${client!.name} | rmd_treatment=${client!.rmd_treatment} | qualified=${d(client!.qualified_account_value)} | baseline_rate=${client!.baseline_comparison_rate}%`);

  const years = runBaselineScenario(client as any, 2026, 30);
  console.log('\nRe-run baseline with FIX applied (ages 72-84):');
  console.log('  age  year   rmdAmount    taxableBalance   taxableGrowth   netWorth');
  for (const y of years.filter((r) => r.age >= 72 && r.age <= 84)) {
    console.log(
      `  ${y.age}   ${y.year}   ${d(y.rmdAmount).padEnd(11)} ${d(y.taxableBalance).padEnd(15)} ${d(y.taxableGrowth ?? 0).padEnd(13)} ${d(y.netWorth)}`
    );
  }

  // Sanity: taxable should be strictly rising once RMDs begin and reinvest.
  const rmdYears = years.filter((r) => (r.rmdAmount ?? 0) > 0).sort((a, b) => a.age - b.age);
  const first = rmdYears[0];
  const second = rmdYears[1];
  console.log(`\nFirst RMD year: age ${first?.age}, RMD ${d(first?.rmdAmount ?? 0)}, taxableBalance ${d(first?.taxableBalance ?? 0)}`);
  console.log(`Second RMD year: age ${second?.age}, taxableBalance ${d(second?.taxableBalance ?? 0)}`);
  const accumulating = (first?.taxableBalance ?? 0) > 0 && (second?.taxableBalance ?? 0) > (first?.taxableBalance ?? 0);
  console.log(`\n${accumulating ? '✅ PASS' : '❌ FAIL'}: reinvested RMDs ${accumulating ? 'now accumulate in the taxable account from year 1.' : 'still NOT accumulating.'}`);
})();
