import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
(async () => {
  // Find recent tickets from Jorge / about Gillman
  const { data: tickets } = await admin
    .from('support_tickets')
    .select('id, subject, description, created_at, severity, category, status, client_id, user_id')
    .or('subject.ilike.%Gillman%,description.ilike.%Gillman%,subject.ilike.%Athene fee%,subject.ilike.%.95%')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('Tickets matching:', JSON.stringify(tickets, null, 2));

  const t = tickets?.[0];
  if (!t) { console.log('No ticket found — trying by recent Jorge tickets'); }

  if (t?.client_id) {
    const { data: client } = await admin.from('clients').select('*').eq('id', t.client_id).maybeSingle();
    console.log('\n=== CLIENT RECORD ===');
    console.log(JSON.stringify(client, null, 2));
  }

  // Also search clients named Gillman directly
  const { data: gclients } = await admin.from('clients').select('*').ilike('name', '%Gillman%');
  console.log('\n=== CLIENTS NAMED GILLMAN ===');
  console.log(JSON.stringify(gclients, null, 2));

  if (t) {
    const { data: comments } = await admin.from('support_ticket_comments').select('body, created_at, is_internal').eq('ticket_id', t.id).order('created_at', { ascending: true });
    console.log('\n=== COMMENTS ===');
    console.log(JSON.stringify(comments, null, 2));

    const { data: atts } = await admin.from('support_ticket_attachments').select('file_path, file_name, mime_type, file_size').eq('ticket_id', t.id);
    console.log('\n=== ATTACHMENTS ===');
    console.log(JSON.stringify(atts, null, 2));
    mkdirSync('/tmp/gillman-ticket', { recursive: true });
    for (const a of atts ?? []) {
      const { data: f, error } = await admin.storage.from('support-attachments').download(a.file_path);
      if (error || !f) { console.log(`FAILED ${a.file_name}:`, error?.message); continue; }
      const arr = await f.arrayBuffer();
      const safe = a.file_name.replace(/[^a-zA-Z0-9._-]/g, '_');
      writeFileSync(`/tmp/gillman-ticket/${safe}`, Buffer.from(arr));
      console.log(`saved /tmp/gillman-ticket/${safe} (${a.mime_type}, ${arr.byteLength} bytes)`);
    }
  }
})();
