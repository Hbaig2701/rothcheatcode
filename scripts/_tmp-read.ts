import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv'; import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {auth:{autoRefreshToken:false,persistSession:false}});
(async()=>{
  for (const frag of process.argv.slice(2)) {
    const { data: cvs } = await admin.from('chat_conversations').select('id,title,created_at,user_id').like('id', frag+'%');
    for (const cv of cvs ?? []) {
      const { data: p } = await admin.from('profiles').select('email').eq('id', cv.user_id).maybeSingle();
      console.log('\n'+'█'.repeat(76));
      console.log(`"${cv.title}"  ${cv.created_at?.slice(0,16)}  ${p?.email}`);
      console.log('█'.repeat(76));
      const { data: ms } = await admin.from('chat_messages').select('role,content,created_at').eq('conversation_id', cv.id).order('created_at',{ascending:true});
      for (const m of ms ?? []) {
        if (m.role === 'tool') continue;
        console.log(`\n── [${m.role.toUpperCase()}] ──`);
        console.log(String(m.content ?? '').slice(0, 1600));
      }
    }
  }
})();
