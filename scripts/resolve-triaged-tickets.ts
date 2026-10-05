// Bulk-resolve the tickets triaged as "already answered / nothing left to do" (Sep 17 2026).
// Mirrors app/api/support-tickets/[id]/route.ts: status -> resolved, resolved_at, status_change event.
// Usage: npx tsx scripts/resolve-triaged-tickets.ts            (dry run)
//        npx tsx scripts/resolve-triaged-tickets.ts --apply    (write)
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const ADMIN_EMAIL = 'hamza@hexonasystems.com';
const APPLY = process.argv.includes('--apply');

const IDS = [
  '92553b83-aaf3-4dcd-b5f8-6aede81f06db', // Byron — spouse age
  '50fe2995-2a55-4697-96b6-2afb7e952c8d', // Marco — strategy summary (fix pushed)
  'e6047dc9-9339-40c8-81b0-a9e7ee6531b1', // Usbelger — illustration ("Ok thank you")
  'f5f66ff7-1773-4a6a-8d10-2e6948b2acdc', // Karen — Ismay SS age (shipped)
  '7971f2a5-09a9-4691-b5bf-e4f4f1234c7f', // Jorge — two bonuses ("Thanks Hamza")
  '2a95f2e9-bc56-4520-9628-ed2d8320dc39', // Jason Breit — Kraus RMD (fixed)
  '3e91dfe4-941d-4c95-b483-416cb251cd2d', // Mark Nichols — deductions (shipped 337803c)
  '666ead9d-b932-4613-a94c-36c4c453dedd', // Bill Burke — Add Entry
  'e53ca690-893a-4ed9-9017-b2b80d7ee31a', // Bill Burke — call request
  'd3291f09-625e-4540-b31a-bf08dbee9a2b', // Bill Burke — walk-through
  'ba86840e-5cf6-4148-8874-e391acaa10b8', // Bill Burke — intro video
  'b03c19ce-45dd-42b5-8933-ed94f04f05ff', // Bill Burke — reschedule
  '93567e31-fced-42a6-bde9-03b8191f2c23', // Bill Burke — Rich Hussey
  '3f591b13-6bfe-49e6-a038-1c2bfdeea8e0', // Jorge — SS & IRMAA
  '4ba363a4-b516-4f98-859f-720a402a939d', // Joshua — 10% penalty-free
  '00cab267-3b69-44fb-ba11-980d384c1391', // Jorge — what's the issue
  'c213961d-0aa9-41d6-ad3a-adc722c57324', // Gerald — chat flag
  'dd3dbb3d-0f16-442e-9cf5-033b2d6ec86e', // Jorge — .95% fee
  '6f73d0bc-41ed-45f0-8a62-00ab9310ffe7', // Jorge — taxes don't match
  'db800875-28ce-4359-8799-22204e92f53d', // Jorge — out of pocket
  'a8f53d6b-b943-4ad4-a577-116d64d7d2b6', // Jorge — why different
  'bbeec6c8-0403-4c90-ad40-b8277dccf021', // Jorge — taxes not matching ("got it")
  '62d32414-32ed-488f-8c26-c098e3626835', // Jorge — page 3 red
  '1d2d9376-1ba8-47f9-86ae-69b05bb60270', // Jason Beyer — Bonadio loading (fixed 17f217c)
  '0f9e093e-fdab-4617-8274-4ef14bd15b84', // Oscar — Bonadio 500 (fixed 17f217c)
  '4cf52816-79ce-4265-8e19-f2c03e359413', // Mazhar — QLAC
  'fa471e9e-e60f-4464-aebb-3eca062d3982', // Elnora — IncomeShield (built)
  'c7607fa0-01f9-49e2-8098-94262a800c15', // Tim Tipton — 51yo conversion
  '86b204c1-b917-4b1e-ad4d-df6dbbb7f417', // Tony Bails — CPA numbers
  '263cf6b0-5660-4994-81a7-a56a69cbe4ec', // Elnora — external tax ("Thank you")
  'dd02263e-798c-42c9-b06b-df978e31add7', // Guillermo — 5-year (fixed, "Thank you")
  '0fddf531-1314-49ac-8f08-053fd35e8166', // Mazhar — IRMAA
  'f0e5ba8c-8234-4a40-af3b-dc1d2630a34a', // Gerald — Gecas income (resolved on save)
  'd1fe968f-efca-4cc7-b333-15261995bfca', // Mark Nichols — total valuation
  'c6a26264-e1bd-46aa-90da-9aa0fa4b4e4d', // Leonard — pay taxes
  '5577c032-bc75-480d-9f31-66aecac7398c', // Harlan — NA Secure Horizon (built)
  '18a524cb-2f13-4870-ad4e-6f83f2077b3c', // Jorge — Kaushick legacy
  'd4895708-8d93-402d-989b-66244e82ed53', // Jorge — Meela $1.2M
  '2b66e21d-12ea-4ed6-8798-d3950259038d', // Bill Duggan — zoom
  '7602febe-64e9-4ff4-a9d3-489582a0c3d0', // Bill Duggan — Action tab
  '1383d178-a71c-4d97-b7e4-d60f44efc44f', // Bill Duggan — delay 2 years (fixed 55f2a08)
  '10bbc29f-10c2-4d42-8cd5-add2816b6f92', // Ian — IRA accounts
  'cc3c7c9d-7e2f-447d-9615-dff5de901874', // Terry King — AssetShield ("it loaded")
  '427cd295-613b-48d3-8efb-d301c9e0f68f', // Sunil — books
  '2c8e8ba5-453b-47a1-a6f4-d66cfd471723', // Sunil — Roth book
  '7877aade-c25b-4545-ac65-fd8a7bbed5f7', // Gary — EquiTrust (no brochure sent)
  '953dbe89-817f-4c58-9470-0f87b100ec54', // Zach — F&G (no brochure sent)
];

(async () => {
  const { data: me } = await admin.from('profiles').select('id, email').eq('email', ADMIN_EMAIL).single();
  if (!me) throw new Error('admin profile not found');

  const { data: tickets, error } = await admin.from('support_tickets').select('id, subject, status').in('id', IDS);
  if (error) throw error;
  const byId = new Map((tickets ?? []).map(t => [t.id, t]));
  const missing = IDS.filter(id => !byId.has(id));
  if (missing.length) console.log('MISSING:', missing);

  const targets = (tickets ?? []).filter(t => t.status !== 'resolved' && t.status !== 'closed');
  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${targets.length} of ${IDS.length} to resolve (${(tickets ?? []).length - targets.length} already resolved/closed)\n`);
  for (const t of targets) console.log(`  [${t.status}] ${t.subject.slice(0, 70)}`);
  if (!APPLY) return;

  const now = new Date().toISOString();
  const { error: upErr } = await admin.from('support_tickets')
    .update({ status: 'resolved', resolved_at: now, updated_at: now })
    .in('id', targets.map(t => t.id));
  if (upErr) throw upErr;
  const { error: evErr } = await admin.from('support_ticket_events').insert(
    targets.map(t => ({ ticket_id: t.id, user_id: me.id, event_type: 'status_change', old_value: t.status, new_value: 'resolved' }))
  );
  if (evErr) throw evErr;

  const { data: after } = await admin.from('support_tickets').select('status').in('id', IDS);
  const counts = (after ?? []).reduce<Record<string, number>>((a, t) => (a[t.status] = (a[t.status] ?? 0) + 1, a), {});
  console.log('\nAFTER:', counts);
})();
