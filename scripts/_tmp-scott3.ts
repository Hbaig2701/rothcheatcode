import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv'; import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {auth:{autoRefreshToken:false,persistSession:false}});
(async()=>{
  const { data: msgs } = await admin.from('chat_messages').select('*')
    .or('content.ilike.%break-even%,content.ilike.%breakeven%,content.ilike.%break even%')
    .order('created_at', { ascending: false }).limit(10);
  console.log('columns on chat_messages:', Object.keys(msgs?.[0] ?? {}).join(', '));
  for (const m of msgs ?? []) {
    console.log('\n' + '─'.repeat(70));
    console.log(`${m.created_at?.slice(0,16)} | role=${m.role}`);
    console.log(String(m.content ?? '').slice(0, 700));
  }
})();
