import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const TICKET = '2a95f2e9-bc56-4520-9628-ed2d8320dc39';
(async () => {
  // Find an admin author — reuse whoever authored prior support replies on this ticket.
  const { data: t } = await admin.from('support_tickets').select('user_id, status').eq('id', TICKET).single();
  const { data: comments } = await admin.from('support_ticket_comments').select('user_id').eq('ticket_id', TICKET).order('created_at', { ascending: true });
  // Admin author = a commenter that is NOT the ticket owner (advisor).
  const adminAuthor = (comments ?? []).map(c => c.user_id).find(uid => uid !== t!.user_id);
  let authorId = adminAuthor;
  if (!authorId) {
    const { data: a } = await admin.from('profiles').select('id').eq('role', 'admin').limit(1).maybeSingle();
    authorId = a?.id;
  }
  console.log('ticket owner:', t!.user_id, '| current status:', t!.status, '| admin author:', authorId);
  if (!authorId) { console.log('No admin author found — aborting'); return; }

  const body = `Hi Jason — you were right, and apologies for the mix-up: that "fixed June 7" note was about a different fix on Marc's account. This one is a separate issue, and it's now fixed and deploying.

The side account wasn't building up the reinvested RMDs because it was being incorrectly reduced each year by the tax on Marc's Social Security and other income. That's corrected now — the after-tax RMD flows into the taxable (brokerage) account every year starting with his first RMD year (age 75) and grows from there.

Once the update is live (a few minutes), please refresh Marc's projection and you'll see the side account build year over year. Thanks for catching this and for your patience.`;

  const { data: ins, error } = await admin.from('support_ticket_comments')
    .insert({ ticket_id: TICKET, user_id: authorId, body, is_internal: false })
    .select('id, created_at').single();
  if (error) { console.log('INSERT ERROR:', error.message); return; }
  console.log('✅ comment posted:', ins.id, ins.created_at);

  const { error: upErr } = await admin.from('support_tickets').update({ status: 'waiting_on_user', updated_at: new Date().toISOString() }).eq('id', TICKET);
  console.log(upErr ? 'status update error: ' + upErr.message : '✅ status → waiting_on_user');
})();
