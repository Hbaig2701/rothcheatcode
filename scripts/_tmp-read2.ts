import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv'; import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {auth:{autoRefreshToken:false,persistSession:false}});
(async()=>{
  for (const frag of process.argv.slice(2)) {
    const { data: ms } = await admin.from('chat_messages').select('role,content,created_at,conversation_id')
      .ilike('conversation_id', frag+'%').order('created_at',{ascending:true});
    if (!ms?.length) { console.log('no messages for', frag); continue; }
    const { data: cv } = await admin.from('chat_conversations').select('title,user_id,created_at').eq('id', ms[0].conversation_id).maybeSingle();
    const { data: p } = cv ? await admin.from('profiles').select('email').eq('id', cv.user_id).maybeSingle() : { data: null };
    console.log('\n'+'█'.repeat(76));
    console.log(`"${cv?.title}"  ${cv?.created_at?.slice(0,16)}  ${(p as any)?.email}`);
    console.log('█'.repeat(76));
    for (const m of ms) {
      if (m.role === 'tool') continue;
      console.log(`\n── [${m.role.toUpperCase()}] ──`);
      console.log(String(m.content ?? '').slice(0, 1500));
    }
  }
})();
