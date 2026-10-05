/**
 * Post the reply to Jorge Tola's "Why is it not converting $1.2mil?" ticket
 * (Mela Desai, d4895708-…). Approved by Hamza 2026-08-29.
 *
 * Figures quoted are verified against the live engine on Mela's actual record:
 * yr1 $259,434, yr2 $40,566, total exactly $300,000 over two years.
 *
 * Usage: npx tsx scripts/post-jorge-mela-reply.ts [--apply]
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const TICKET = 'd4895708-8d93-402d-989b-66244e82ed53';
const apply = process.argv.includes('--apply');

const body = `Hi Jorge — two things here.

Why it's not converting the $1.2M: the scenario is set to Partial with a target of $300,000. Partial means "convert this much in total, then stop" — it's a lifetime total, not a per-year amount. So on a $1.2M IRA it converts $300,000 and leaves the rest where it is. If you want the whole $1.2M converted, switch to Full, or raise the target.

Why it looked slow: we've just changed how that target works when taxes come out of the IRA. It now counts only what actually lands in the Roth, instead of counting the tax against it too. So the money converts as fast as the tax brackets allow rather than being stretched over extra years.

That's live now. Open Mela again and you'll see:

- Year 1: $259,434
- Year 2: $40,566
- $300,000 total, done in two years

Nothing to re-save — just reopen the client and it recalculates.

The same change affects Kaushick, so his legacy number will have moved up too. Both are worth a fresh look before your next conversation with either client.

Thanks for flagging it.`;

(async () => {
  const { data: t } = await admin.from('support_tickets').select('user_id, status, subject').eq('id', TICKET).single();
  const { data: comments } = await admin.from('support_ticket_comments').select('user_id').eq('ticket_id', TICKET).order('created_at', { ascending: true });
  const adminAuthor = (comments ?? []).map(c => c.user_id).find(uid => uid !== t!.user_id);
  let authorId = adminAuthor;
  if (!authorId) {
    const { data: a } = await admin.from('profiles').select('id, email').eq('role', 'admin').limit(1).maybeSingle();
    authorId = a?.id;
    console.log('admin author (fallback):', a?.email);
  }
  console.log(`ticket: ${t!.subject} | status: ${t!.status} | author: ${authorId}`);
  if (!authorId) { console.log('No admin author found — aborting'); return; }

  if (!apply) {
    console.log('\n--- DRY RUN ---\n' + body + '\n\n(pass --apply to post)');
    return;
  }

  const { data: ins, error } = await admin.from('support_ticket_comments')
    .insert({ ticket_id: TICKET, user_id: authorId, body, is_internal: false })
    .select('id, created_at').single();
  if (error) { console.log('INSERT ERROR:', error.message); return; }
  console.log('comment posted:', ins.id, ins.created_at);

  const { error: upErr } = await admin.from('support_tickets')
    .update({ status: 'waiting_on_user', updated_at: new Date().toISOString() }).eq('id', TICKET);
  console.log(upErr ? 'status error: ' + upErr.message : 'status → waiting_on_user');
})();
