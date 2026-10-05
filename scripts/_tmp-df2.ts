import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv'; import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {auth:{autoRefreshToken:false,persistSession:false}});
(async()=>{
  for (const id of process.argv.slice(2)) {
    const { data: cv } = await admin.from('chat_conversations').select('title, created_at').eq('id', id).single();
    console.log('\n' + '█'.repeat(78));
    console.log(`CONVERSATION: "${cv?.title}"  (${cv?.created_at?.slice(0,16)})`);
    console.log('█'.repeat(78));
    const { data: ms } = await admin.from('chat_messages').select('role, content, created_at').eq('conversation_id', id).order('created_at',{ascending:true});
    for (const m of ms ?? []) {
      console.log(`\n${'─'.repeat(78)}\n[${m.role.toUpperCase()}] ${m.created_at?.slice(11,16)}\n`);
      console.log(String(m.content ?? ''));
    }
  }
})();
