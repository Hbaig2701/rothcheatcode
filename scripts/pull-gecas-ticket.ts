import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
(async () => {
  const { data: tickets } = await admin
    .from('support_tickets')
    .select('id, subject, description, created_at, severity, category, status, client_id, user_id')
    .order('created_at', { ascending: false })
    .limit(15);
  console.log('=== RECENT TICKETS ===');
  for (const t of tickets ?? []) console.log(t.created_at, '|', t.subject, '|', (t.description || '').slice(0, 120), '| client_id:', t.client_id, '| user:', t.user_id);

  const { data: clients } = await admin.from('clients').select('*').ilike('name', '%Gecas%');
  console.log('\n=== CLIENTS NAMED GECAS ===', (clients ?? []).length);
  for (const c of clients ?? []) {
    console.log('---', c.id, c.name, 'user:', c.user_id, 'created:', c.created_at, 'updated:', c.updated_at, 'parent:', c.parent_client_id);
    console.log('  non_ssi_income:', JSON.stringify(c.non_ssi_income));
    console.log('  ss_self:', c.ss_self, 'ss_spouse:', c.ss_spouse, 'pension:', c.pension, 'other_income:', c.other_income);
    console.log('  gross_taxable_non_ssi:', (c as any).gross_taxable_non_ssi, 'tax_exempt_non_ssi:', (c as any).tax_exempt_non_ssi);
  }

  // advisor lookup
  const { data: prof } = await admin.from('profiles').select('*').eq('email', 'gshaw@mysummitadvisors.com').maybeSingle();
  console.log('\n=== ADVISOR PROFILE ===', JSON.stringify(prof, null, 2));
  if (prof?.id) {
    const { data: theirClients } = await admin.from('clients').select('id,name,created_at,updated_at,parent_client_id').eq('user_id', prof.id).order('updated_at', { ascending: false }).limit(30);
    console.log('\n=== THEIR CLIENTS ===');
    for (const c of theirClients ?? []) console.log(c.id, '|', c.name, '| upd', c.updated_at, '| parent', c.parent_client_id);
  }
})();
