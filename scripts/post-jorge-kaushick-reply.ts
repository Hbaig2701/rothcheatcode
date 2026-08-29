/**
 * Post the reply to Jorge Tola's "Legacy numbers seem very low?" ticket
 * (Kaushick Desai, 18a524cb-…). Approved by Hamza 2026-08-29.
 *
 * Follows scripts/post-jason-reply.ts: admin author = a prior non-owner
 * commenter, else the first profile with role='admin'. This ticket has zero
 * comments, so it will take the fallback.
 *
 * Usage: npx tsx scripts/post-jorge-kaushick-reply.ts [--apply]
 *        (dry-run by default)
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const TICKET = '18a524cb-2f13-4870-ad4e-6f83f2077b3c';
const apply = process.argv.includes('--apply');

const body = `Hi Jorge — two separate things going on here.

On the pages not matching: the Roth growth page shows only the Roth account, while the year-over-year strategy page shows all the balances together — traditional, Roth and taxable. So the Roth page will always look much smaller than the strategy table. They're measuring different things rather than disagreeing. If that isn't the pair you meant, send me the two page headings and I'll take another look — I can see you generated a version with a different section selection, so our page numbers may not line up.

On the legacy looking low, that one is partly us.

The scenario is set to Partial conversion with a target of $175,000 against a $750,000 IRA. Partial means "convert this much in total, then stop" — a lifetime cap, not a per-year amount. So about 77% of the IRA never converts, stays traditional, and gets taxed to your heirs at the 40% rate in the assumptions. That's the main driver of the low legacy number. If you want more converted, raise the target or switch to Full.

On top of that, we've found a genuine bug on our side in how the partial target is applied when taxes are paid from the IRA: it converts less each year than it should and stretches the conversion over far more years than necessary, which suppresses the legacy figure further. Kaushick is affected by it. We've started on the fix and I'll let you know when it's live so you can re-run him.

Thanks for flagging both — the second one is a real find and it affects other accounts too, so you've done us a favour.`;

(async () => {
  const { data: t } = await admin.from('support_tickets').select('user_id, status, subject').eq('id', TICKET).single();
  const { data: comments } = await admin.from('support_ticket_comments').select('user_id').eq('ticket_id', TICKET).order('created_at', { ascending: true });
  const adminAuthor = (comments ?? []).map(c => c.user_id).find(uid => uid !== t!.user_id);
  let authorId = adminAuthor;
  if (!authorId) {
    const { data: a } = await admin.from('profiles').select('id, email').eq('role', 'admin').limit(1).maybeSingle();
    authorId = a?.id;
    console.log('admin author (fallback):', a?.email, authorId);
  }
  console.log(`ticket: ${t!.subject}`);
  console.log(`owner: ${t!.user_id} | status: ${t!.status} | author: ${authorId}`);
  if (!authorId) { console.log('No admin author found — aborting'); return; }

  if (!apply) {
    console.log('\n--- DRY RUN, body to post ---\n');
    console.log(body);
    console.log('\n(pass --apply to post and set status → waiting_on_user)');
    return;
  }

  const { data: ins, error } = await admin.from('support_ticket_comments')
    .insert({ ticket_id: TICKET, user_id: authorId, body, is_internal: false })
    .select('id, created_at').single();
  if (error) { console.log('INSERT ERROR:', error.message); return; }
  console.log('comment posted:', ins.id, ins.created_at);

  const { error: upErr } = await admin.from('support_tickets')
    .update({ status: 'waiting_on_user', updated_at: new Date().toISOString() }).eq('id', TICKET);
  console.log(upErr ? 'status update error: ' + upErr.message : 'status → waiting_on_user');
})();
