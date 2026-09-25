import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
(async () => {
  const { data: prof } = await admin.from('profiles').select('id, email').eq('email', 'info@retirementsolutions4u.net').maybeSingle();
  console.log('Profile:', JSON.stringify(prof, null, 2));

  // Most recent tickets from this advisor
  const { data: tickets } = await admin
    .from('support_tickets')
    .select('id, subject, description, created_at, severity, category, status, client_id, user_id')
    .eq('user_id', prof?.id ?? '')
    .order('created_at', { ascending: false })
    .limit(8);
  console.log('\n=== RECENT TICKETS FROM JORGE ===');
  console.log(JSON.stringify(tickets, null, 2));

  // Pick the Goldstein one
  const t = tickets?.find(x => /goldstein|question/i.test(x.subject + ' ' + (x.description ?? ''))) ?? tickets?.[0];
  if (!t) { console.log('No ticket found'); return; }
  console.log('\n=== SELECTED TICKET ===');
  console.log('id:', t.id);
  console.log('subject:', t.subject);
  console.log('status:', t.status, '| severity:', t.severity, '| category:', t.category);
  console.log('client_id:', t.client_id);
  console.log('created_at:', t.created_at);
  console.log('description:\n', t.description);

  if (t.client_id) {
    const { data: client } = await admin.from('clients').select('*').eq('id', t.client_id).maybeSingle();
    console.log('\n=== CLIENT RECORD ===');
    console.log(JSON.stringify(client, null, 2));
  } else {
    // Try to find a Goldstein client owned by Jorge
    const { data: gclients } = await admin.from('clients').select('id, name, product_type, created_at').ilike('name', '%goldstein%');
    console.log('\n=== GOLDSTEIN CLIENTS (search) ===');
    console.log(JSON.stringify(gclients, null, 2));
  }

  const { data: comments, error: cErr } = await admin.from('support_ticket_comments').select('body, created_at, is_internal, user_id').eq('ticket_id', t.id).order('created_at', { ascending: true });
  console.log('\n=== COMMENTS ===');
  console.log(cErr ? 'ERROR: ' + cErr.message : JSON.stringify(comments, null, 2));

  const { data: atts, error: aErr } = await admin.from('support_ticket_attachments').select('file_path, file_name, mime_type, file_size').eq('ticket_id', t.id);
  console.log('\n=== ATTACHMENTS ===');
  console.log(aErr ? 'ERROR: ' + aErr.message : JSON.stringify(atts, null, 2));
  mkdirSync('/tmp/jorge-goldstein', { recursive: true });
  for (const a of atts ?? []) {
    const { data: f, error } = await admin.storage.from('support-attachments').download(a.file_path);
    if (error || !f) { console.log(`FAILED ${a.file_name}:`, error?.message); continue; }
    const arr = await f.arrayBuffer();
    const safe = a.file_name.replace(/[^a-zA-Z0-9._-]/g, '_');
    writeFileSync(`/tmp/jorge-goldstein/${safe}`, Buffer.from(arr));
    console.log(`saved /tmp/jorge-goldstein/${safe} (${a.mime_type}, ${arr.byteLength} bytes)`);
  }
})();