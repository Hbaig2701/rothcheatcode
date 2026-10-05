/**
 * Reply to Greg Stopp's "ADD NEW COLUMN?" ticket (55ffbc4a-…).
 * Shipped in 159558f (table column), bb569ba (PDF), 4f4e9ce (growth scope).
 * Usage: npx tsx scripts/post-greg-column-reply.ts [--apply]
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv'; import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const TICKET = '55ffbc4a-f30c-40c3-9c79-9c651e0aafdb';
const apply = process.argv.includes('--apply');

const body = `Hi Greg — done, it's live now.

There's a new Tax on Conversion column, and it sits right next to the Roth Conversion amount like you asked. It's the same number Story Mode shows: federal and state tax combined for that year's conversion.

Two places you'll find it:

On the report table — open Adjust Columns and switch it on. You'll need to add it manually because you've got saved column layouts, and those take priority over new columns so we don't rearrange a setup you've already tuned.

On the PDF — it's there automatically on the Strategy - Account Overview page, no setup needed.

One thing worth knowing: there's an older column called "Fed Tax (Conversions)" which only covers the federal side. For your Texas and Florida clients the two match, but for California, New Jersey and Utah the new one will be higher because it includes state tax. The new column is the one to use.

It also fills a gap on the PDF for clients who pay their conversion tax from a brokerage account rather than from the IRA. On those cases the "Tax from IRA" column reads $0 — correctly, since nothing came out of the IRA — so the conversion tax wasn't shown anywhere on that page. Howard Scho is one of those: he converts around $418,550 in the first year, and the tax on it now shows as $82,546.

Thanks for the suggestion.`;

(async () => {
  const { data: t } = await admin.from('support_tickets').select('user_id, status, subject').eq('id', TICKET).single();
  const { data: cs } = await admin.from('support_ticket_comments').select('user_id').eq('ticket_id', TICKET).order('created_at');
  let authorId = (cs ?? []).map(c=>c.user_id).find(u=>u!==t!.user_id);
  if (!authorId) { const { data:a } = await admin.from('profiles').select('id').eq('role','admin').limit(1).maybeSingle(); authorId = a?.id; }
  console.log(`ticket: ${t!.subject} | status ${t!.status}`);
  if (!apply) { console.log('\nDRY RUN\n' + body); return; }
  const { data: ins, error } = await admin.from('support_ticket_comments')
    .insert({ ticket_id: TICKET, user_id: authorId, body, is_internal: false }).select('id, created_at').single();
  if (error) { console.log('INSERT ERROR:', error.message); return; }
  console.log('posted:', ins.id, ins.created_at);
  const { error: e2 } = await admin.from('support_tickets').update({ status: 'waiting_on_user', updated_at: new Date().toISOString() }).eq('id', TICKET);
  console.log(e2 ? 'status error: '+e2.message : 'status -> waiting_on_user');
})();
