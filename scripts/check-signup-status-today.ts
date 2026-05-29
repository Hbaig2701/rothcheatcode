/**
 * For every completed Checkout Session today, check whether the customer
 * has actually finished setup (auth user exists + profile populated).
 *
 * Usage: npx tsx scripts/check-signup-status-today.ts
 */

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const stripeKey = process.env.STRIPE_SECRET_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.retirementexpert.ai';

if (!stripeKey || !supabaseUrl || !serviceKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const stripe = new Stripe(stripeKey);
const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

(async () => {
  // 1. Today's completed Checkout Sessions.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const sinceUnix = Math.floor(startOfToday.getTime() / 1000);
  const sessions = await stripe.checkout.sessions.list({
    created: { gte: sinceUnix },
    limit: 100,
  });
  const completed = sessions.data.filter((s) => s.status === 'complete');

  // Dedupe by email (keep the earliest session per customer).
  const byEmail = new Map<string, (typeof completed)[number]>();
  for (const s of completed.sort((a, b) => a.created - b.created)) {
    const email = s.customer_details?.email?.toLowerCase();
    if (!email) continue;
    if (!byEmail.has(email)) byEmail.set(email, s);
  }

  // 2. Pull all auth users (paginated). For each session email check if
  //    auth user exists and is confirmed.
  const allUsers: { id: string; email: string | undefined }[] = [];
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error('listUsers failed:', error.message);
      process.exit(1);
    }
    allUsers.push(...data.users.map((u) => ({ id: u.id, email: u.email })));
    if (data.users.length < 200) break;
    page += 1;
  }
  const usersByEmail = new Map<string, { id: string }>();
  for (const u of allUsers) {
    if (u.email) usersByEmail.set(u.email.toLowerCase(), { id: u.id });
  }

  // 3. For users that exist, check profile for stripe_customer_id (= linked
  //    to a paid plan = fully set up vs. half-state).
  const setUp: string[] = [];
  const notSetUp: { name: string; email: string; link: string }[] = [];

  for (const [email, session] of byEmail) {
    const name = session.customer_details?.name ?? '—';
    const user = usersByEmail.get(email);
    if (!user) {
      notSetUp.push({
        name,
        email,
        link: `${appUrl}/welcome?session_id=${session.id}`,
      });
      continue;
    }
    // Auth user exists — check profile is linked.
    const { data: profile } = await admin
      .from('profiles')
      .select('stripe_customer_id, plan, subscription_status')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.stripe_customer_id) {
      setUp.push(`${name} <${email}>  plan=${profile.plan}/${profile.subscription_status}`);
    } else {
      // Half-state: auth user exists but Stripe not linked.
      notSetUp.push({
        name: `${name} (auth exists, Stripe unlinked)`,
        email,
        link: `${appUrl}/welcome?session_id=${session.id}`,
      });
    }
  }

  console.log(`\n=== SET UP (${setUp.length}) ===`);
  setUp.forEach((s) => console.log(`  ✓  ${s}`));

  console.log(`\n=== NOT SET UP (${notSetUp.length}) ===`);
  notSetUp.forEach((s) => {
    console.log(`  ✗  ${s.name} <${s.email}>`);
    console.log(`     ${s.link}`);
  });

  process.exit(0);
})();
