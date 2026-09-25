import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

(async () => {
  const { data: prof } = await admin.from('profiles').select('id, email, plan').eq('email', 'davidkferguson@gmail.com').maybeSingle();
  if (!prof) { console.log('no profile'); return; }
  console.log('profile:', prof);

  const { data: tickets } = await admin
    .from('support_tickets')
    .select('*')
    .eq('user_id', prof.id)
    .order('created_at', { ascending: true });
  console.log(`\nTICKETS: ${tickets?.length ?? 0}`);
  for (const t of tickets ?? []) {
    let clientName = '—';
    if (t.client_id) {
      const { data: c } = await admin.from('clients').select('name').eq('id', t.client_id).maybeSingle();
      clientName = c?.name ?? '(deleted client)';
    }
    const { data: comments } = await admin.from('support_ticket_comments').select('body, created_at, is_internal, user_id').eq('ticket_id', t.id).order('created_at', { ascending: true });
    const { data: atts } = await admin.from('support_ticket_attachments').select('file_name, storage_path').eq('ticket_id', t.id);
    console.log('━'.repeat(90));
    console.log(`[${t.status.toUpperCase()}] ${t.subject}  (${t.category} / ${t.severity})`);
    console.log(`  id: ${t.id} | client: ${clientName} (${t.client_id}) | created: ${t.created_at}`);
    console.log(`  attachments: ${(atts ?? []).map(a => a.file_name).join(', ') || 'none'}`);
    console.log(`  description:\n${t.description}`);
    for (const cm of comments ?? []) {
      const who = cm.user_id === t.user_id ? 'advisor' : 'admin';
      console.log(`  --- ${who}${cm.is_internal ? ' (internal)' : ''} @ ${cm.created_at}\n${cm.body}`);
    }
  }

  // Cheryl Ellis client record
  const { data: clients } = await admin.from('clients').select('*').eq('user_id', prof.id).ilike('name', '%ellis%');
  for (const c of clients ?? []) {
    console.log('\n' + '═'.repeat(90));
    console.log('CLIENT:', c.name, c.id);
    console.log(JSON.stringify(c, null, 2));
  }
})();
