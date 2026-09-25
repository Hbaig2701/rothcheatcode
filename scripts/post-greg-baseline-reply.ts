/**
 * Reply to Greg Stopp's "Baseline Question in columns?" ticket (690ebb2f-…).
 *
 * Verified: the Schlip client has $30,000 in the pre-existing Roth IRA field.
 * Running his record reproduces the exact figures in his screenshot —
 * $31,950 / $34,027 / $36,238 — i.e. $30,000 compounding at the baseline rate.
 * Not a defect; the baseline withholds the conversions, not money he already has.
 *
 * Usage: npx tsx scripts/post-greg-baseline-reply.ts [--apply]
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const TICKET = '690ebb2f-e414-4e18-bc0d-4d9f35663c3c';
const apply = process.argv.includes('--apply');

const body = `Hi Greg — good question, and the numbers are behaving correctly here.

That column is showing the Roth money the Schlips already have. On this client there's $30,000 entered in the Roth IRA field, and the baseline just lets it sit there and grow.

You can see it in your own screenshot: 2026 shows $31,950, which is that $30,000 plus a year of growth. Then $34,027, then $36,238, and so on. The Conversion column stays at $0 the whole way down, which is the part that matters — the baseline isn't converting anything.

The way to think about it: the baseline answers "what happens if they do nothing," and doing nothing doesn't make money they already own disappear. It only holds back the conversions. If the baseline zeroed out their existing Roth, the comparison would actually be unfair to the do-nothing side, because we'd be deleting real money from it.

If you'd rather the baseline show zero Roth, clear the Roth IRA field on the client — but only if they genuinely don't have one. If the $30,000 is real, leave it in; the comparison is more accurate with it there.

One small thing I noticed while looking: there's more than one Schlip record in your account with the same numbers. Might be worth deleting whichever one you're not using so you don't end up updating the wrong one.

Thanks for flagging it.`;

(async () => {
  const { data: t } = await admin.from('support_tickets').select('user_id, status, subject').eq('id', TICKET).single();
  const { data: cs } = await admin.from('support_ticket_comments').select('user_id').eq('ticket_id', TICKET).order('created_at');
  let authorId = (cs ?? []).map(c => c.user_id).find(u => u !== t!.user_id);
  if (!authorId) {
    const { data: a } = await admin.from('profiles').select('id, email').eq('role','admin').limit(1).maybeSingle();
    authorId = a?.id; console.log('author (fallback):', a?.email);
  }
  console.log(`ticket: ${t!.subject} | status ${t!.status}`);
  if (!apply) { console.log('\n--- DRY RUN ---\n' + body); return; }
  const { data: ins, error } = await admin.from('support_ticket_comments')
    .insert({ ticket_id: TICKET, user_id: authorId, body, is_internal: false }).select('id, created_at').single();
  if (error) { console.log('INSERT ERROR:', error.message); return; }
  console.log('posted:', ins.id, ins.created_at);
  const { error: e2 } = await admin.from('support_tickets').update({ status: 'waiting_on_user', updated_at: new Date().toISOString() }).eq('id', TICKET);
  console.log(e2 ? 'status error: '+e2.message : 'status → waiting_on_user');
})();
