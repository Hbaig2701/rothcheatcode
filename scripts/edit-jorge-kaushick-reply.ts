/**
 * Edit the already-posted reply on Jorge Tola's "Legacy numbers seem very low?"
 * ticket (comment 33914fec-…) to reframe the change, drop the fault language, and answer the page-7-vs-9
 * question with the actual figures from his attached PDF ($43,396 combined
 * interest vs $7,298 Roth growth).
 *
 * Usage: npx tsx scripts/edit-jorge-kaushick-reply.ts [--apply]
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const COMMENT_ID = '33914fec-bf35-4e42-a18b-4b3b85b7e67f';
const apply = process.argv.includes('--apply');

const body = `Hi Jorge — two separate things here.

On the pages not matching: they're showing different things. The Interest column on the Strategy Account Overview page is the interest earned across both accounts combined — for 2026 that's $43,396. The Tax-Free Roth Growth page only shows the Roth side of it, which is $7,298. The other $36,098 was earned inside the IRA, which that page deliberately leaves out since it isn't tax-free money. So the two pages should look different, and the Roth page will always be the smaller number.

On the legacy number: the scenario is set to Partial conversion with a target of $175,000 against a $750,000 IRA. Partial means "convert this much in total, then stop" — it's a lifetime total, not a per-year amount. So about 77% of the IRA stays where it is, and your heirs get taxed on it at the 40% rate in the assumptions. That's the main reason the legacy figure looks low. If you want more converted, raise the target or switch to Full.

We've also changed how that target works when taxes are paid from the IRA. It now counts only what actually lands in the Roth rather than counting the tax against it too, so the money converts as fast as the tax brackets allow instead of being spread over extra years. That's live, and it lifts the legacy number as well.

One thing to expect: the year-by-year figures won't line up exactly with the PDF you sent. Kaushick is over 65, and we've added the new senior deduction to the tax calculation since that report was generated, which changes how much room there is in each bracket. Treat the attached PDF as out of date and pull a fresh one.

Just reopen Kaushick and everything recalculates on its own — nothing to re-save. Worth a fresh look before your next conversation with him.

Thanks for flagging both.`;

(async () => {
  const { data: before, error: readErr } = await admin
    .from('support_ticket_comments')
    .select('id, ticket_id, body, created_at')
    .eq('id', COMMENT_ID)
    .single();
  if (readErr || !before) { console.log('read error:', readErr?.message); return; }

  console.log(`comment ${before.id} on ticket ${before.ticket_id}, posted ${before.created_at}`);
  console.log(`\ncurrent body mentions "bug": ${/bug/i.test(before.body)}`);
  console.log(`new body mentions "bug":     ${/bug/i.test(body)}`);

  if (!apply) {
    console.log('\n--- NEW BODY (dry run) ---\n');
    console.log(body);
    console.log('\n(pass --apply to save)');
    return;
  }

  const { error } = await admin
    .from('support_ticket_comments')
    .update({ body })
    .eq('id', COMMENT_ID);
  if (error) { console.log('UPDATE ERROR:', error.message); return; }

  const { data: after } = await admin
    .from('support_ticket_comments').select('body').eq('id', COMMENT_ID).single();
  console.log(`\nupdated. body still mentions "bug": ${/bug/i.test(after!.body)}`);
})();
