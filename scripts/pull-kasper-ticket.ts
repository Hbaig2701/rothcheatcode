import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
(async () => {
  const { data: tickets } = await admin
    .from('support_tickets')
    .select('id, subject, description, created_at, severity, category, status, client_id, user_id')
    .or('subject.ilike.%taxes%,description.ilike.%Kasper%,subject.ilike.%match%')
    .order('created_at', { ascending: false })
    .limit(10);
  const t = (tickets ?? []).find(x => /match|taxes/i.test(x.subject) && /kasper|page 5|page 8/i.test(x.description || '')) ?? (tickets ?? [])[0];
  console.log('Ticket:', JSON.stringify(t, null, 2));
  if (!t) return;

  if (t.client_id) {
    const { data: client } = await admin.from('clients').select('*').eq('id', t.client_id).maybeSingle();
    console.log('\n=== CLIENT RECORD ===');
    console.log(JSON.stringify(client, null, 2));
  }
  const { data: kclients } = await admin.from('clients').select('id,name,blueprint_type,bonus_percent,qualified_account_value,conversion_type,fixed_conversion_amount,surrender_years,updated_at').ilike('name', '%Kasper%');
  console.log('\n=== CLIENTS NAMED KASPER ===');
  console.log(JSON.stringify(kclients, null, 2));

  const { data: comments } = await admin.from('support_ticket_comments').select('body, created_at, is_internal').eq('ticket_id', t.id).order('created_at', { ascending: true });
  console.log('\n=== COMMENTS ===', JSON.stringify(comments, null, 2));

  const { data: atts } = await admin.from('support_ticket_attachments').select('file_path, file_name, mime_type, file_size').eq('ticket_id', t.id);
  console.log('\n=== ATTACHMENTS ===', JSON.stringify(atts, null, 2));
  mkdirSync('/tmp/kasper-ticket', { recursive: true });
  for (const a of atts ?? []) {
    const { data: f, error } = await admin.storage.from('support-attachments').download(a.file_path);
    if (error || !f) { console.log(`FAILED ${a.file_name}:`, error?.message); continue; }
    const arr = await f.arrayBuffer();
    const safe = a.file_name.replace(/[^a-zA-Z0-9._-]/g, '_');
    writeFileSync(`/tmp/kasper-ticket/${safe}`, Buffer.from(arr));
    console.log(`saved /tmp/kasper-ticket/${safe} (${a.mime_type}, ${arr.byteLength} bytes)`);
  }
})();
