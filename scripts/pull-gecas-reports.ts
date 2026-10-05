import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
config({ path: resolve(process.cwd(), '.env.local'), quiet: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const ids = ['4eaba0c8-fe2e-43f0-893a-8743e7ac94bc', 'c2f683ad-6db2-4f11-a7b4-165676c67fef'];
(async () => {
  const { data: projections, error: e1 } = await admin.from('projections').select('*').in('client_id', ids).order('created_at', { ascending: false });
  console.log('projections err', e1?.message, 'count', projections?.length);
  mkdirSync('/tmp/gecas', { recursive: true });
  for (const p of projections ?? []) {
    console.log('--- projection', p.id, 'client', p.client_id, 'created', p.created_at, 'strategy', p.strategy, 'keys:', Object.keys(p).join(','));
    writeFileSync(`/tmp/gecas/projection-${p.id}.json`, JSON.stringify(p, null, 2));
  }
  const { data: reports, error: e2 } = await admin.from('reports').select('*').in('client_id', ids).order('created_at', { ascending: false });
  console.log('\nreports err', e2?.message, 'count', reports?.length);
  for (const r of reports ?? []) {
    const { file_path, ...rest } = r as any;
    console.log('--- report', JSON.stringify(rest).slice(0, 800), '| path', file_path);
  }

  // ticket attachments
  const { data: t } = await admin.from('support_tickets').select('id').eq('client_id', ids[0]).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (t) {
    const { data: atts } = await admin.from('support_ticket_attachments').select('*').eq('ticket_id', t.id);
    console.log('\nattachments:', JSON.stringify(atts, null, 2));
    for (const a of atts ?? []) {
      const { data: f, error } = await admin.storage.from('support-attachments').download(a.file_path);
      if (error || !f) { console.log('FAILED', a.file_name, error?.message); continue; }
      const buf = Buffer.from(await f.arrayBuffer());
      const safe = a.file_name.replace(/[^a-zA-Z0-9._-]/g, '_');
      writeFileSync(`/tmp/gecas/${safe}`, buf);
      console.log('saved /tmp/gecas/' + safe, buf.length);
    }
    const { data: comments } = await admin.from('support_ticket_comments').select('body, created_at, is_internal').eq('ticket_id', t.id).order('created_at');
    console.log('\ncomments:', JSON.stringify(comments, null, 2));
  }
})();
