import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { isInternalTeamEmail } from '../lib/auth/internal-team';
import { getStripe } from '../lib/stripe';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const stripe = getStripe();

const TEST_EMAILS = ['hbkidspare+homework@gmail.com', 'allank94@live.com'];
const REFUNDED_SAME_DAY_EMAILS = ['derrick@derrickphelps.com'];
const keep = (e: string) => !TEST_EMAILS.includes(e) && !REFUNDED_SAME_DAY_EMAILS.includes(e) && !isInternalTeamEmail(e);

(async () => {
  const { data: all } = await admin
    .from('profiles')
    .select('email, subscription_status, billing_cycle, canceled_at, stripe_customer_id')
    .eq('role', 'advisor')
    .eq('subscription_status', 'canceled')
    .not('stripe_customer_id', 'is', null);

  const churned = (all ?? []).filter((p) => keep(p.email))
    .sort((a, b) => (b.canceled_at ?? '').localeCompare(a.canceled_at ?? ''));

  console.log('Recovering billing interval from Stripe for each churned customer...\n');
  const results: { email: string; canceled_at: string; interval: string }[] = [];
  for (const p of churned) {
    let interval = 'unknown';
    try {
      const subs = await stripe.subscriptions.list({ customer: p.stripe_customer_id!, status: 'all', limit: 10 });
      // Most recent sub (canceled) — read its price recurring interval.
      const sub = subs.data.sort((a, b) => b.created - a.created)[0];
      const recur = sub?.items?.data?.[0]?.price?.recurring;
      if (recur?.interval === 'month') interval = 'monthly';
      else if (recur?.interval === 'year') interval = 'annual';
      else if (recur?.interval) interval = recur.interval;
    } catch (e: any) {
      interval = 'error: ' + e.message;
    }
    results.push({ email: p.email, canceled_at: (p.canceled_at ?? '').slice(0, 10), interval });
    console.log(`  ${(p.canceled_at ?? '').slice(0,10)}  ${interval.padEnd(8)}  ${p.email}`);
  }

  const monthlyChurned = results.filter((r) => r.interval === 'monthly');
  const annualChurned = results.filter((r) => r.interval === 'annual');
  const now = new Date('2026-06-11T00:00:00Z').getTime();
  const within = (d: string, days: number) => d && (now - new Date(d).getTime()) / 86400000 <= days;

  console.log(`\nChurned split: ${monthlyChurned.length} monthly, ${annualChurned.length} annual`);
  console.log(`Monthly churned in last 30 days: ${monthlyChurned.filter(r => within(r.canceled_at, 30)).length}`);
  console.log(`Monthly churned in last 90 days: ${monthlyChurned.filter(r => within(r.canceled_at, 90)).length}`);
})();
