import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

(async () => {
  const { data: clients } = await admin.from('clients').select('id, name, user_id, age, product_name').ilike('name', '%Kraus%');
  console.log('Matching clients:', JSON.stringify(clients, null, 2));
  if (!clients?.length) return;

  for (const c of clients) {
    const { data: projs } = await admin
      .from('projections')
      .select('id, created_at, baseline_years')
      .eq('client_id', c.id)
      .order('created_at', { ascending: false })
      .limit(1);
    const proj = projs?.[0];
    console.log(`\n=== ${c.name} (${c.id}) — latest projection ${proj?.id} @ ${proj?.created_at} ===`);
    if (!proj?.baseline_years) { console.log('  no baseline_years'); continue; }
    const years = proj.baseline_years as any[];
    // Find age 75 / year 2041 row
    const row = years.find((y) => y.age === 75) ?? years.find((y) => y.year === 2041);
    if (!row) { console.log('  no age-75 row found; ages present:', years.map(y => y.age).join(',')); continue; }
    console.log('  age-75 row key fields:');
    console.log('    year:', row.year, ' age:', row.age);
    console.log('    rmdAmount:', row.rmdAmount);
    console.log('    totalIRAWithdrawal:', row.totalIRAWithdrawal);
    console.log('    federalTax:', row.federalTax);
    console.log('    totalTax:', row.totalTax);
    console.log('    >>> federalTaxOnIRAWithdrawal:', row.federalTaxOnIRAWithdrawal, '<<<  (this is the "Federal Tax on RMD" column)');
    console.log('    has field?', Object.prototype.hasOwnProperty.call(row, 'federalTaxOnIRAWithdrawal'));
  }
})();
