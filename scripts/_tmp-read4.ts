import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv'; import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {auth:{autoRefreshToken:false,persistSession:false}});
(async()=>{
  for (const probe of process.argv.slice(2)) {
    const { data: seed } = await admin.from('chat_messages').select('conversation_id').eq('role','user').ilike('content', `%${probe}%`).limit(1);
    const id = seed?.[0]?.conversation_id; if (!id) { console.log('not found:', probe); continue; }
    const { data: cv } = await admin.from('chat_conversations').select('title,created_at').eq('id', id).maybeSingle();
    console.log('\n'+'█'.repeat(74)); console.log(`"${cv?.title}" ${cv?.created_at?.slice(0,16)}`); console.log('█'.repeat(74));
    const { data: ms } = await admin.from('chat_messages').select('role,content').eq('conversation_id', id).order('created_at',{ascending:true});
    for (const m of ms ?? []) {
      if (m.role === 'tool') continue;
      console.log(`\n── [${m.role.toUpperCase()}] ──`);
      console.log(String(m.content ?? '').slice(0, 1100));
    }
  }
})();
