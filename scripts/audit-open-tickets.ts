import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

(async () => {
  const { data: tickets, error } = await admin
    .from('support_tickets')
    .select('id, subject, description, status, severity, category, created_at, updated_at, user_id, client_id')
    .in('status', ['open', 'in_progress', 'waiting_on_user'])
    .order('created_at', { ascending: true });
  if (error) { console.error(error); return; }
  console.log(`OPEN / IN_PROGRESS / WAITING tickets: ${tickets?.length ?? 0}\n`);

  for (const t of tickets ?? []) {
    // submitter
    const { data: prof } = await admin.from('profiles').select('email').eq('id', t.user_id).maybeSingle();
    const { data: settings } = await admin.from('user_settings').select('first_name, last_name').eq('user_id', t.user_id).maybeSingle();
    const submitter = [settings?.first_name, settings?.last_name].filter(Boolean).join(' ').trim() || prof?.email || t.user_id;
    // client
    let clientName = '—';
    if (t.client_id) {
      const { data: c } = await admin.from('clients').select('name').eq('id', t.client_id).maybeSingle();
      clientName = c?.name ?? '(deleted client)';
    }
    // comments
    const { data: comments } = await admin.from('support_ticket_comments').select('body, created_at, is_internal, user_id').eq('ticket_id', t.id).order('created_at', { ascending: true });
    // attachments
    const { data: atts } = await admin.from('support_ticket_attachments').select('file_name').eq('ticket_id', t.id);

    const aiEscalated = (t.description ?? '').includes('[AI-escalated from chat]');
    const feedbackFlag = (t.description ?? '').includes('thumbs-down');
    const origin = aiEscalated ? 'AI-escalated' : feedbackFlag ? 'chat-feedback' : 'manual';

    console.log('━'.repeat(90));
    console.log(`[${t.status.toUpperCase()}] ${t.subject}`);
    console.log(`  id: ${t.id}`);
    console.log(`  origin: ${origin} | severity: ${t.severity} | category: ${t.category}`);
    console.log(`  submitter: ${submitter}  | client: ${clientName}`);
    console.log(`  created: ${(t.created_at ?? '').slice(0,10)}  | updated: ${(t.updated_at ?? '').slice(0,10)}`);
    console.log(`  attachments: ${atts?.length ?? 0}${atts?.length ? ' (' + atts.map(a => a.file_name).join(', ') + ')' : ''}`);
    console.log(`  comments: ${comments?.length ?? 0}`);
    for (const cm of comments ?? []) {
      const who = cm.user_id === t.user_id ? 'advisor' : 'admin/other';
      console.log(`     - [${(cm.created_at ?? '').slice(0,10)}] ${who}${cm.is_internal ? ' (internal)' : ''}: ${(cm.body ?? '').slice(0, 200).replace(/\n/g, ' ')}`);
    }
    const desc = (t.description ?? '').replace('[AI-escalated from chat]', '').trim();
    console.log(`  description: ${desc.slice(0, 400).replace(/\n+/g, ' ')}${desc.length > 400 ? '…' : ''}`);
  }
})();
