/**
 * Push the corrected Knighthead Chartline Bonus 10 default rate (5.5% -> 6.0%)
 * into every advisor's adopted copy. Adopted products are snapshots of the
 * community row, so re-seeding the catalog does NOT reach them.
 *
 * Only form_defaults.rate_of_return changes — the rate an advisor sees when
 * they pick the product on a NEW client. Existing client scenarios store their
 * own rate_of_return and are deliberately left alone.
 *
 * Usage: npx tsx scripts/sync-knighthead-rate-to-adopters.ts [--apply]
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const PRODUCT = 'Knighthead Chartline Bonus 10';
const NEW_RATE = 6.0;
const apply = process.argv.includes('--apply');

(async () => {
  const { data: rows, error } = await admin.from('custom_products').select('id, user_id, config').eq('name', PRODUCT);
  if (error) { console.error(error.message); process.exit(1); }
  console.log(apply ? 'APPLYING:' : 'DRY RUN (pass --apply):');
  for (const r of rows ?? []) {
    const { data: prof } = await admin.from('profiles').select('email').eq('id', r.user_id).maybeSingle();
    const cfg = r.config as Record<string, unknown>;
    const fd = (cfg.form_defaults ?? {}) as Record<string, unknown>;
    const old = fd.rate_of_return;
    if (old === NEW_RATE) { console.log(`  SKIP  ${prof?.email} — already ${NEW_RATE}%`); continue; }
    if (!apply) { console.log(`  WOULD UPDATE  ${prof?.email}: ${old}% -> ${NEW_RATE}%`); continue; }
    const next = { ...cfg, form_defaults: { ...fd, rate_of_return: NEW_RATE } };
    const { error: upErr } = await admin.from('custom_products').update({ config: next, updated_at: new Date().toISOString() }).eq('id', r.id);
    if (upErr) { console.error(`  FAILED ${prof?.email}: ${upErr.message}`); process.exit(1); }
    console.log(`  UPDATED  ${prof?.email}: ${old}% -> ${NEW_RATE}%`);
  }
  process.exit(0);
})();
