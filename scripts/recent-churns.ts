import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { isInternalTeamEmail } from '../lib/auth/internal-team';
config({ path: resolve(process.cwd(), '.env.local') });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

// Mirror the admin/advisors route exclusions.
const TEST_EMAILS = ['hbkidspare+homework@gmail.com', 'allank94@live.com'];
const REFUNDED_SAME_DAY_EMAILS = ['derrick@derrickphelps.com'];

(async () => {
  const { data: rows, error } = await admin
    .from('profiles')
    .select('id, email, plan, billing_cycle, created_at, canceled_at, current_period_end, cancel_at_period_end, subscription_status, stripe_customer_id')
    .eq('role', 'advisor')
    .eq('subscription_status', 'canceled')
    .not('stripe_customer_id', 'is', null)
    .order('canceled_at', { ascending: false, nullsFirst: false });
  if (error) { console.error(error); return; }

  const churned = (rows ?? []).filter(
    (p) =>
      !TEST_EMAILS.includes(p.email) &&
      !REFUNDED_SAME_DAY_EMAILS.includes(p.email) &&
      !isInternalTeamEmail(p.email)
  );

  // Names from user_settings
  const ids = churned.map((p) => p.id);
  const { data: settings } = await admin.from('user_settings').select('user_id, first_name, last_name').in('user_id', ids);
  const nameOf = new Map<string, string>();
  for (const s of settings ?? []) nameOf.set(s.user_id, [s.first_name, s.last_name].filter(Boolean).join(' ').trim());

  console.log(`\nTotal churned advisors (excluding test/internal/same-day-refund): ${churned.length}\n`);
  console.log('Most recent churns:');
  for (const p of churned.slice(0, 15)) {
    const name = nameOf.get(p.id) || '(no name)';
    const when = p.canceled_at ? new Date(p.canceled_at).toISOString().slice(0, 10) : 'unknown date';
    const plan = `${p.plan}${p.billing_cycle ? '/' + p.billing_cycle : ''}`;
    console.log(`  ${when}  ${name.padEnd(24)} ${p.email.padEnd(34)} ${plan}`);
  }
})();
