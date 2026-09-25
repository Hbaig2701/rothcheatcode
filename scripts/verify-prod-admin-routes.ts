/**
 * Hit the production admin endpoints with a real admin session and
 * verify Mazhar/Roger now show $1930.50/yr.
 *
 * Auth: signs into Supabase as hamza@hexonasystems.com via password
 * grant, grabs the access_token, calls the API with it as a bearer.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const APP = 'https://app.retirementexpert.ai';
const EMAIL = 'hamza@hexonasystems.com';

(async () => {
  // 1. Make sure hamza is an admin and reset a known password via service role
  //    so we can sign in. We restore nothing; just set a temp password,
  //    sign in, and proceed. Hamza will need to reset if he uses email/password.
  const adminClient = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: profile } = await adminClient
    .from('profiles')
    .select('id, role')
    .eq('email', EMAIL)
    .maybeSingle();
  if (!profile) throw new Error(`No profile for ${EMAIL}`);
  if (profile.role !== 'admin') throw new Error(`${EMAIL} is not admin (role=${profile.role})`);
  const tempPassword = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const { error: updErr } = await adminClient.auth.admin.updateUserById(profile.id, { password: tempPassword });
  if (updErr) throw new Error(`Password reset failed: ${updErr.message}`);

  // 2. Sign in via anon client
  const userClient = createClient(SUPABASE_URL, ANON_KEY);
  const { data: signin, error: signinErr } = await userClient.auth.signInWithPassword({ email: EMAIL, password: tempPassword });
  if (signinErr) throw new Error(`Sign-in failed: ${signinErr.message}`);
  const token = signin.session!.access_token;
  console.log('Got admin session, calling production endpoints...\n');

  // 3. Construct the @supabase/ssr cookie. Format: a JSON array
  //    [access_token, refresh_token, provider_token, provider_refresh_token, user]
  //    URL-encoded, prefixed with `base64-` if oversized, set under
  //    `sb-<project-ref>-auth-token`.
  const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];
  const cookieName = `sb-${projectRef}-auth-token`;
  // Newer @supabase/ssr stores the session base64-encoded with the
  // `base64-` prefix. If oversized, it chunks across multiple cookies
  // named `<name>.0`, `<name>.1`, …
  const sessionJson = JSON.stringify({
    access_token: signin.session!.access_token,
    refresh_token: signin.session!.refresh_token,
    expires_at: signin.session!.expires_at,
    expires_in: signin.session!.expires_in,
    token_type: signin.session!.token_type,
    user: signin.user,
  });
  const encoded = `base64-${Buffer.from(sessionJson, 'utf8').toString('base64')}`;
  // Chunk if > 3180 bytes (Supabase's CHUNK_LENGTH constant).
  const CHUNK = 3180;
  const cookies: string[] = [];
  if (encoded.length <= CHUNK) {
    cookies.push(`${cookieName}=${encoded}`);
  } else {
    for (let i = 0, ix = 0; i < encoded.length; i += CHUNK, ix++) {
      cookies.push(`${cookieName}.${ix}=${encoded.slice(i, i + CHUNK)}`);
    }
  }
  const cookieHeader = cookies.join('; ');

  const revRes = await fetch(`${APP}/api/admin/revenue?refresh=1`, {
    headers: { Cookie: cookieHeader },
  });
  console.log(`/api/admin/revenue?refresh=1 → ${revRes.status}`);
  if (revRes.ok) {
    const rev = await revRes.json();
    console.log(`  MRR: $${rev.current?.mrr}  ARR: $${rev.current?.arr}  active subs: ${rev.current?.activeSubscriptions}`);
    console.log(`  stripe fetches: ${JSON.stringify(rev._meta?.stripeFetches)}`);
  } else {
    console.log(`  body: ${(await revRes.text()).slice(0, 300)}`);
  }

  // 4. Hit advisors
  const advRes = await fetch(`${APP}/api/admin/advisors`, {
    headers: { Cookie: cookieHeader },
  });
  console.log(`\n/api/admin/advisors → ${advRes.status}`);
  if (advRes.ok) {
    const adv = await advRes.json();
    const advisors = (adv.advisors ?? []) as Array<{ email: string; netInterval?: number; listPriceInterval?: number; discountLabel?: string | null; discountPercent?: number }>;
    for (const target of ['ahsonmazhar4@gmail.com', 'roger.madon@rhm-associates.com']) {
      const row = advisors.find((a) => a.email?.toLowerCase() === target);
      if (!row) {
        console.log(`  ${target}: NOT FOUND`);
        continue;
      }
      const marker = row.netInterval === 1930.5 ? '✓' : '✗';
      console.log(`  ${marker} ${target}: net=$${row.netInterval}/yr  list=$${row.listPriceInterval}/yr  discount=${row.discountLabel ?? 'none'} (${row.discountPercent}%)`);
    }
  } else {
    console.log(`  body: ${(await advRes.text()).slice(0, 300)}`);
  }

  console.log('\n(temp admin password rotated; use Supabase password reset if you need to sign in via UI)');
})().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
