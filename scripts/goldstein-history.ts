import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const usd = (c: number | null | undefined) => c == null ? 'null' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(c / 100);
const CID = 'cb7a54be-0098-4a87-b6da-e5b6b009a72c';

(async () => {
  // 1) Client audit log / current values
  const { data: client } = await admin.from('clients').select('created_at, updated_at, name').eq('id', CID).single();
  console.log('CLIENT created:', client?.created_at, '| updated:', client?.updated_at);

  // 2) All projections stored for this client (each run = a snapshot in time)
  const { data: projs, error } = await admin
    .from('projections')
    .select('*')
    .eq('client_id', CID)
    .order('created_at', { ascending: true });
  if (error) { console.log('proj err:', error.message); }

  console.log(`\n=== ${projs?.length ?? 0} PROJECTION RUNS (oldest first) ===`);
  for (const p of projs ?? []) {
    console.log('\n--- run created:', p.created_at, '---');
    console.log('  input_hash:', (p.input_hash ?? '').slice(0, 16));
    console.log('  baseline gross (net worth):', usd(p.baseline_final_net_worth), '| baseline trad:', usd(p.baseline_final_traditional));
    console.log('  strategy gross (net worth):', usd(p.blueprint_final_net_worth), '| strategy trad:', usd(p.blueprint_final_traditional));
    // dump any stored input snapshot columns if present
    for (const k of Object.keys(p)) {
      if (/rate|amount|value|bonus|conversion|balance|premium|surrender|ira/i.test(k) && !/final|_years|hash/i.test(k)) {
        console.log(`    ${k}:`, p[k]);
      }
    }
  }

  // 3) Check for an audit/history table on clients
  const { data: audit, error: aerr } = await admin.from('client_audit_log').select('*').eq('client_id', CID).order('created_at', { ascending: true }).limit(50);
  if (!aerr) {
    console.log('\n=== CLIENT AUDIT LOG ===');
    console.log(JSON.stringify(audit, null, 2));
  } else {
    console.log('\n(no client_audit_log table:', aerr.message, ')');
  }
})();
