/**
 * Copy Greg Stopp's "Howard Scho" client into Hamza's account so the new
 * "Tax on Conversion" PDF column can be checked on a real case.
 *
 * Scho is the sharpest test: FL (no state tax), $3.5M IRA, conversion tax paid
 * from a $10M taxable account — so "Tax from IRA" is legitimately $0 and, before
 * this change, the strategy page showed a large conversion with no tax anywhere.
 *
 * He is attached to a CUSTOM product, which is owned by Greg. Copying the client
 * alone would leave a dangling custom_product_id and change the projection, so
 * the product is copied first and the clone re-pointed at Hamza's copy.
 *
 * Idempotent: skips whatever already exists.
 *
 * Usage: npx tsx scripts/copy-scho-to-hamza.ts [--apply]
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv'; import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const SRC_CLIENT = 'f6a75735';
const DEST_EMAIL = 'hamza@hexonasystems.com';
const NEW_NAME = 'Howard Scho (PDF column test)';
const apply = process.argv.includes('--apply');

(async () => {
  const { data: dest } = await admin.from('profiles').select('id,email').eq('email', DEST_EMAIL).single();
  const { data: srcList } = await admin.from('clients').select('*').ilike('name','%Howard Scho%');
  const src: any = (srcList ?? []).find((c:any)=>String(c.id).startsWith(SRC_CLIENT));
  if (!src) { console.error('source client not found'); process.exit(1); }
  console.log(`source: "${src.name}" (${String(src.id).slice(0,8)}) owner ${String(src.user_id).slice(0,8)}`);
  console.log(`dest:   ${dest!.email} (${String(dest!.id).slice(0,8)})`);

  // -- custom product --
  let destProductId: string | null = null;
  if (src.custom_product_id) {
    const { data: prod } = await admin.from('custom_products').select('*').eq('id', src.custom_product_id).single();
    console.log(`product: "${prod!.name}"`);
    const { data: existing } = await admin.from('custom_products').select('id').eq('user_id', dest!.id).eq('name', prod!.name).maybeSingle();
    if (existing) { destProductId = existing.id; console.log(`  already in dest account (${String(existing.id).slice(0,8)}) — reusing`); }
    else if (apply) {
      const { id, user_id, created_at, updated_at, ...rest } = prod as any;
      const { data: np, error } = await admin.from('custom_products').insert({ ...rest, user_id: dest!.id }).select('id').single();
      if (error) { console.error('product copy failed:', error.message); process.exit(1); }
      destProductId = np!.id; console.log(`  copied -> ${String(np!.id).slice(0,8)}`);
    } else console.log('  would copy product');
  }

  // -- client --
  const { data: dupe } = await admin.from('clients').select('id').eq('user_id', dest!.id).eq('name', NEW_NAME).maybeSingle();
  if (dupe) { console.log(`\nclient "${NEW_NAME}" already exists (${String(dupe.id).slice(0,8)}) — nothing to do`); return; }
  if (!apply) { console.log(`\nDRY RUN — would create "${NEW_NAME}"`); return; }

  const { id, user_id, created_at, updated_at, ...rest } = src;
  const { data: nc, error } = await admin.from('clients')
    .insert({ ...rest, user_id: dest!.id, name: NEW_NAME, custom_product_id: destProductId })
    .select('id, name').single();
  if (error) { console.error('client copy failed:', error.message); process.exit(1); }
  console.log(`\ncreated "${nc!.name}"`);
  console.log(`  id: ${nc!.id}`);
  console.log(`  results: https://app.retirementexpert.ai/clients/${nc!.id}/results`);
})();
