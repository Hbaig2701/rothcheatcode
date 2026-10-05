import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
(async () => {
  // Find the ticket by subject/submitter. Try profiles for the email first.
  const { data: prof } = await admin.from('profiles').select('id, email').eq('email', 'info@retirementsolutions4u.net').maybeSingle();
  console.log('Profile:', JSON.stringify(prof, null, 2));

  let q = admin
    .from('support_tickets')
    .select('id, subject, description, created_at, severity, category, status, client_id, user_id')
    .ilike('subject', '%adding up%')
    .order('created_at', { ascending: false })
    .limit(5);
  const { data: tickets } = await q;
  console.log('Tickets matching subject:', JSON.stringify(tickets, null, 2));

  // Pick the Chris Kracke one (or first)
  const t = tickets?.[0];
  if (!t) { console.log('No ticket found'); return; }
  console.log('\n=== SELECTED TICKET ===');
  console.log('id:', t.id);
  console.log('subject:', t.subject);
  console.log('client_id:', t.client_id);
  console.log('description:\n', t.description);

  // Pull client record
  if (t.client_id) {
    const { data: client } = await admin.from('clients').select('*').eq('id', t.client_id).maybeSingle();
    console.log('\n=== CLIENT RECORD (Chris Kracke) ===');
    console.log(JSON.stringify(client, null, 2));
  }

  // Comments on the ticket
  const { data: comments, error: cErr } = await admin.from('support_ticket_comments').select('body, created_at, is_internal').eq('ticket_id', t.id).order('created_at', { ascending: true });
  console.log('\n=== COMMENTS ===');
  console.log(cErr ? 'ERROR: ' + cErr.message : JSON.stringify(comments, null, 2));

  // Attachments
  const { data: atts, error: aErr } = await admin.from('support_ticket_attachments').select('file_path, file_name, mime_type, file_size').eq('ticket_id', t.id);
  console.log('\n=== ATTACHMENTS ===');
  console.log(aErr ? 'ERROR: ' + aErr.message : JSON.stringify(atts, null, 2));
  mkdirSync('/tmp/jorge-ticket', { recursive: true });
  for (const a of atts ?? []) {
    const { data: f, error } = await admin.storage.from('support-attachments').download(a.file_path);
    if (error || !f) { console.log(`FAILED ${a.file_name}:`, error?.message); continue; }
    const arr = await f.arrayBuffer();
    const safe = a.file_name.replace(/[^a-zA-Z0-9._-]/g, '_');
    writeFileSync(`/tmp/jorge-ticket/${safe}`, Buffer.from(arr));
    console.log(`saved /tmp/jorge-ticket/${safe} (${a.mime_type}, ${arr.byteLength} bytes)`);
  }
})();
