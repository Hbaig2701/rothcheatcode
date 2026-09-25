import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
(async () => {
  const { data: greg } = await admin.from('profiles').select('id').eq('email', 'greg@bluestarstrategy.com').single();
  const { data: tickets } = await admin
    .from('support_tickets')
    .select('id, subject, description, created_at')
    .eq('user_id', greg!.id)
    .ilike('subject', '%Story%')
    .order('created_at', { ascending: false })
    .limit(2);
  console.log('Story Mode tickets:', JSON.stringify(tickets, null, 2));
  const t = tickets?.[0];
  if (!t) return;
  const { data: atts } = await admin.from('support_ticket_attachments').select('file_path, file_name').eq('ticket_id', t.id);
  mkdirSync('/tmp/greg-story', { recursive: true });
  for (const a of atts ?? []) {
    const { data: f } = await admin.storage.from('support-attachments').download(a.file_path);
    if (!f) continue;
    const arr = await f.arrayBuffer();
    writeFileSync(`/tmp/greg-story/${a.file_name.replace(/[^a-zA-Z0-9._-]/g, '_')}`, Buffer.from(arr));
    console.log(`saved ${a.file_name}`);
  }
})();
