import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { isInternalTeamEmail } from '../lib/auth/internal-team';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const TEST_EMAILS = ['hbkidspare+homework@gmail.com', 'allank94@live.com'];
const REFUNDED_SAME_DAY_EMAILS = ['derrick@derrickphelps.com'];
const keep = (e: string) => !TEST_EMAILS.includes(e) && !REFUNDED_SAME_DAY_EMAILS.includes(e) && !isInternalTeamEmail(e);

(async () => {
  const { data: all } = await admin
    .from('profiles')
    .select('id, email, plan, subscription_status, billing_cycle, created_at, canceled_at, stripe_subscription_id')
    .eq('role', 'advisor')
    .not('stripe_customer_id', 'is', null);

  const profiles = (all ?? []).filter((p) => keep(p.email));

  const active = profiles.filter((p) => p.subscription_status === 'active' || p.subscription_status === 'trialing');
  const canceled = profiles.filter((p) => p.subscription_status === 'canceled');

  const activeMonthly = active.filter((p) => p.billing_cycle === 'monthly');
  const activeAnnual = active.filter((p) => p.billing_cycle === 'annual');
  const activeUnknownCycle = active.filter((p) => p.billing_cycle !== 'monthly' && p.billing_cycle !== 'annual');

  console.log('=== ACTIVE/TRIALING SUBSCRIBERS ===');
  console.log(`  monthly: ${activeMonthly.length}`);
  console.log(`  annual:  ${activeAnnual.length}`);
  console.log(`  unknown/null cycle: ${activeUnknownCycle.length}`, activeUnknownCycle.map(p => p.email));

  console.log('\n=== CHURNED (canceled) — raw billing_cycle retained? ===');
  for (const p of canceled.sort((a, b) => (b.canceled_at ?? '').localeCompare(a.canceled_at ?? ''))) {
    console.log(`  ${(p.canceled_at ?? 'no-date').slice(0,10)}  cycle=${JSON.stringify(p.billing_cycle)}  sub=${p.stripe_subscription_id ? 'yes' : 'no'}  ${p.email}`);
  }

  // Trailing-window churn counts (by canceled_at)
  const now = new Date('2026-06-11T00:00:00Z').getTime();
  const days = (p: any) => p.canceled_at ? (now - new Date(p.canceled_at).getTime()) / 86400000 : Infinity;
  const last30 = canceled.filter((p) => days(p) <= 30);
  const last90 = canceled.filter((p) => days(p) <= 90);
  console.log(`\n=== CHURN WINDOWS (by canceled_at, ref date 2026-06-11) ===`);
  console.log(`  churned last 30 days: ${last30.length}`);
  console.log(`  churned last 90 days: ${last90.length}`);
})();
