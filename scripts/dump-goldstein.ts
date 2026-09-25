import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync } from 'fs';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
(async () => {
  const { data, error } = await admin.from('clients').select('*').eq('id', 'cb7a54be-0098-4a87-b6da-e5b6b009a72c').single();
  if (error) { console.log('ERROR:', error.message); return; }
  const json = JSON.stringify(data, null, 2);
  const out = '/private/tmp/claude-501/-Users-hamzabaig-Documents-Github-REPOS-rothcheatcode/500defeb-c502-45d0-acc9-d7f81da1c606/scratchpad/goldstein-current.json';
  writeFileSync(out, json);
  console.log(json);
  console.log('\nSaved to:', out);
})();
