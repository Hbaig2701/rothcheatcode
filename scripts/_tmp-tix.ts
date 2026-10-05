import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv'; import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {auth:{autoRefreshToken:false,persistSession:false}});
(async()=>{
  const { data: t } = await admin.from('support_tickets').select('*').eq('id','e19e035e-393f-415f-9780-18c16e8afdbf').maybeSingle();
  console.log('TICKET:', t?.subject, '| status', t?.status);
  console.log((t?.description ?? '').slice(0,500));
  const { data: cm } = await admin.from('support_ticket_comments').select('body,created_at,is_internal').eq('ticket_id', t?.id).order('created_at');
  for (const c of cm ?? []) console.log(`\n  -- [${c.created_at?.slice(0,10)}]${c.is_internal?' (internal)':''}: ${String(c.body).slice(0,400)}`);
  // real settings for the two clients
  for (const nm of ['bonadio','eppolito']) {
    const { data: cs } = await admin.from('clients').select('name, age, conversion_type, max_tax_rate, constraint_type, respect_penalty_free_limit, penalty_free_scope, penalty_free_percent, years_to_defer_conversion, tax_payment_source, surrender_years, blueprint_type, filing_status')
      .ilike('name', `%${nm}%`).limit(2);
    for (const c of cs ?? []) console.log('\nCLIENT', JSON.stringify(c, null, 1));
  }
})();
