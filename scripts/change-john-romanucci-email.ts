/**
 * Change John Romanucci's account email.
 *   john_romanucci@yahoo.com  ->  johnromanucci1993@gmail.com
 *
 * He asked us to use the gmail going forward and asked which address he signs in
 * with; confirmed with him that he wants the account itself moved, so the two
 * stay the same rather than him juggling one for email and another for login.
 *
 * Updates BOTH places the address lives:
 *   - auth.users.email  (what he actually signs in with)
 *   - profiles.email    (what the app reads for display / lookup)
 * A trigger fills profiles.email at signup only, so it does NOT follow an auth
 * change on its own — write both or they silently diverge.
 *
 * email_confirm: true marks the new address verified immediately. Without it he
 * could not sign in until he clicked a link sent to the new inbox — exactly the
 * lockout we want to avoid. Password is untouched.
 *
 * Usage: npx tsx scripts/change-john-romanucci-email.ts [--apply]
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const UID = '2b5d0631-2691-4ba8-b42a-001ba1e16218';
const OLD = 'john_romanucci@yahoo.com';
const NEW = 'johnromanucci1993@gmail.com';
const apply = process.argv.includes('--apply');

(async () => {
  const { data: got, error: getErr } = await admin.auth.admin.getUserById(UID);
  if (getErr || !got.user) { console.error('cannot read user:', getErr?.message); process.exit(1); }
  if (got.user.email?.toLowerCase() !== OLD) {
    console.error(`ABORT: expected ${OLD}, found ${got.user.email}`); process.exit(1);
  }
  for (let page = 1; page <= 20; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (!data.users.length) break;
    const clash = data.users.find(u => u.email?.toLowerCase() === NEW.toLowerCase() && u.id !== UID);
    if (clash) { console.error(`ABORT: ${NEW} already belongs to ${clash.id}`); process.exit(1); }
    if (data.users.length < 200) break;
  }
  console.log(`user ${UID}`);
  console.log(`  auth email:   ${got.user.email}`);
  console.log(`  last sign-in: ${got.user.last_sign_in_at}`);
  console.log(`  target:       ${NEW} (free)`);
  if (!apply) { console.log('\nDRY RUN — pass --apply to make the change'); return; }

  const { error: authErr } = await admin.auth.admin.updateUserById(UID, { email: NEW, email_confirm: true });
  if (authErr) { console.error('auth update FAILED:', authErr.message); process.exit(1); }

  const { error: profErr } = await admin.from('profiles').update({ email: NEW }).eq('id', UID);
  if (profErr) {
    console.error('profiles update FAILED:', profErr.message);
    console.error('!! auth ALREADY changed — auth and profiles now DIVERGE. Fix profiles manually.');
    process.exit(1);
  }

  const { data: after } = await admin.auth.admin.getUserById(UID);
  const { data: prof } = await admin.from('profiles').select('email').eq('id', UID).single();
  console.log('\nafter:');
  console.log(`  auth.users.email: ${after.user!.email}  (confirmed: ${after.user!.email_confirmed_at ? 'yes' : 'NO'})`);
  console.log(`  profiles.email:   ${prof!.email}`);
  console.log(`  in sync: ${after.user!.email === prof!.email ? 'yes' : 'NO — INVESTIGATE'}`);
})();
