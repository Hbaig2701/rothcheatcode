/**
 * Edit the posted reply on Jorge Tola's "Why is it not converting $1.2mil?"
 * ticket (comment 25d38d35-…).
 *
 * WHY: the first version quoted exact figures ($259,434 / $40,566) from the live
 * engine. Those are right for Mela's saved record today, but his attached PDF was
 * generated before the OBBA senior-deduction change deployed — and both he and
 * his spouse are 65+, so his bracket room (and therefore the conversion amounts)
 * shifted for that reason as well. Quoting dollars to the cent invites a
 * "these don't match" reply. Describe the shape of the change instead.
 *
 * Usage: npx tsx scripts/edit-jorge-mela-reply.ts [--apply]
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const COMMENT_ID = '25d38d35-f8c1-4c2a-a686-6063c0297dae';
const apply = process.argv.includes('--apply');

const body = `Hi Jorge — two things here.

Why it's not converting the $1.2M: the scenario is set to Partial with a target of $300,000. Partial means "convert this much in total, then stop" — it's a lifetime total, not a per-year amount. So on a $1.2M IRA it converts $300,000 and leaves the rest where it is. If you want the whole $1.2M converted, switch to Full, or raise the target.

Why it looked slow: we've changed how that target works when taxes come out of the IRA. It now counts only what actually lands in the Roth, instead of counting the tax against it too. In your PDF the $300,000 was trickling out over six years — $191,706, then $74,937, then $22,990, and so on down to $798. It now converts as fast as the tax brackets allow, so Mela finishes in about two years instead of six.

That's live. Just reopen Mela and it recalculates — nothing to re-save.

One thing to expect: the year-by-year amounts won't line up exactly with the PDF you sent. Both Mela and her spouse are over 65, and we've also added the new senior deduction to the tax calculation since that report was generated, which changes how much room there is in each bracket. So treat the attached PDF as out of date and work from a fresh one.

The same conversion change affects Kaushick, so his legacy number will have moved up too. Both are worth a fresh look before your next conversation with either client.

Thanks for flagging it.`;

(async () => {
  const { data: before, error } = await admin
    .from('support_ticket_comments').select('id, ticket_id, body, created_at').eq('id', COMMENT_ID).single();
  if (error || !before) { console.log('read error:', error?.message); return; }
  console.log(`comment ${before.id} on ticket ${before.ticket_id}, posted ${before.created_at}`);
  console.log(`current quotes $259,434: ${/259,434/.test(before.body)}`);
  console.log(`new quotes $259,434:     ${/259,434/.test(body)}`);
  console.log(`new cites his own PDF figures ($191,706): ${/191,706/.test(body)}`);

  if (!apply) { console.log('\n--- NEW BODY (dry run) ---\n' + body + '\n\n(pass --apply to save)'); return; }

  const { error: upErr } = await admin.from('support_ticket_comments').update({ body }).eq('id', COMMENT_ID);
  if (upErr) { console.log('UPDATE ERROR:', upErr.message); return; }
  const { data: after } = await admin.from('support_ticket_comments').select('body').eq('id', COMMENT_ID).single();
  console.log(`\nupdated. still quotes $259,434: ${/259,434/.test(after!.body)}`);
})();
