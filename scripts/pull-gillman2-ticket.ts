import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
(async () => {
  const { data: tickets } = await admin
    .from('support_tickets')
    .select('id, subject, description, created_at, status, client_id')
    .ilike('subject', '%why are these two reports different%')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('Tickets:', JSON.stringify(tickets, null, 2));
  const t = tickets?.[0];
  if (!t) return;
  const { data: atts } = await admin.from('support_ticket_attachments').select('file_path, file_name, mime_type, file_size, created_at').eq('ticket_id', t.id);
  console.log('\n=== ATTACHMENTS ===', JSON.stringify(atts, null, 2));
  mkdirSync('/tmp/gillman2-ticket', { recursive: true });
  for (const a of atts ?? []) {
    const { data: f, error } = await admin.storage.from('support-attachments').download(a.file_path);
    if (error || !f) { console.log(`FAILED ${a.file_name}:`, error?.message); continue; }
    const arr = await f.arrayBuffer();
    const safe = a.file_name.replace(/[^a-zA-Z0-9._-]/g, '_');
    writeFileSync(`/tmp/gillman2-ticket/${safe}`, Buffer.from(arr));
    console.log(`saved /tmp/gillman2-ticket/${safe} (${a.mime_type}, ${arr.byteLength} bytes)`);
  }
})();
