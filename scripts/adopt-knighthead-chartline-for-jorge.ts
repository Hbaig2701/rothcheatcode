/**
 * Adopt the two North American Secure Horizon Accelerator community products
 * into Harlan Endelman's account (superharlan@gmail.com).
 *
 * Mirrors adoptCommunityProduct() in lib/products/community-repository.ts
 * exactly — same field-for-field copy, source='adopted_from_community',
 * community_product_id set — so the rows are indistinguishable from ones he'd
 * have created by clicking "Adopt" in the Community catalog himself. The copy is
 * independent of the catalog by design: later catalog edits don't touch it, and
 * his edits don't touch the catalog.
 *
 * Idempotent: skips any product he already has by that name (custom_products has
 * a unique constraint on user_id + name).
 *
 * IDENTITY CONFIRMED: superharlan@gmail.com holds clients named "Jeanine Horner"
 * (TX, age 66, $708,000 IRA, North American / Secure Horizon Accelerator) —
 * matching the illustration he sent. Active 'standard' advisor.
 *
 * Usage: npx tsx scripts/adopt-na-secure-horizon-for-harlan.ts [--apply]
 *        (dry-run by default; pass --apply to write)
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const ADVISOR_EMAIL = 'info@retirementsolutions4u.net';
const PRODUCT_NAMES = ['Knighthead Chartline Bonus 10'];

const apply = process.argv.includes('--apply');

(async () => {
  // Resolve the advisor by email rather than hardcoding the UUID, so this fails
  // loudly if the account changes instead of silently writing to a stale id.
  const { data: profile, error: profErr } = await admin
    .from('profiles')
    .select('id, email, role, is_active')
    .eq('email', ADVISOR_EMAIL)
    .maybeSingle();
  if (profErr || !profile) {
    console.error(`Could not resolve advisor ${ADVISOR_EMAIL}:`, profErr?.message ?? 'not found');
    process.exit(1);
  }
  console.log(`Advisor: ${profile.email} (${profile.id}) role=${profile.role} active=${profile.is_active}`);

  const { data: catalog, error: catErr } = await admin
    .from('community_products')
    .select('*')
    .in('name', PRODUCT_NAMES);
  if (catErr) {
    console.error('Failed to read catalog:', catErr.message);
    process.exit(1);
  }
  if ((catalog?.length ?? 0) !== PRODUCT_NAMES.length) {
    console.error(`Expected ${PRODUCT_NAMES.length} catalog rows, found ${catalog?.length ?? 0}. Seed first.`);
    process.exit(1);
  }

  const { data: existing } = await admin
    .from('custom_products')
    .select('name')
    .eq('user_id', profile.id);
  const have = new Set((existing ?? []).map((p) => p.name));

  console.log(apply ? '\nAPPLYING:' : '\nDRY RUN (pass --apply to write):');
  for (const src of catalog!) {
    if (!src.is_published) {
      console.log(`  SKIP  ${src.name} — not published`);
      continue;
    }
    if (have.has(src.name)) {
      console.log(`  SKIP  ${src.name} — already in library`);
      continue;
    }
    if (!apply) {
      console.log(`  WOULD ADOPT  ${src.name}`);
      continue;
    }
    const { data, error } = await admin
      .from('custom_products')
      .insert({
        user_id: profile.id,
        name: src.name,
        carrier_name: src.carrier_name,
        carrier_product_name: src.carrier_product_name,
        category: src.category,
        archetype: src.archetype,
        engine_preset: src.engine_preset,
        modifier_flags: src.modifier_flags,
        config: src.config,
        source: 'adopted_from_community',
        community_product_id: src.id,
      })
      .select('id, name, source, community_product_id')
      .single();
    if (error) {
      console.error(`  FAILED  ${src.name}: ${error.message}`);
      process.exit(1);
    }
    console.log(`  ADOPTED ${data.name} (id=${data.id})`);
  }
  process.exit(0);
})();
