import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv'; import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {auth:{autoRefreshToken:false,persistSession:false}});
(async()=>{
  const { data: seed } = await admin.from('chat_messages').select('conversation_id, created_at, content')
    .eq('role','user').ilike('content','%that is wrong i am seeing a 230%').limit(1);
  const convId = seed?.[0]?.conversation_id;
  console.log('conversation:', convId);
  const { data: ms } = await admin.from('chat_messages').select('role,content,created_at')
    .eq('conversation_id', convId).order('created_at',{ascending:true});
  for (const m of ms ?? []) {
    if (m.role === 'tool') { console.log('\n── [tool call] ──'); continue; }
    console.log(`\n── [${m.role.toUpperCase()}] ──`);
    console.log(String(m.content ?? '').slice(0, 1800));
  }
})();
