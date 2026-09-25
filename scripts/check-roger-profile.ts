import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

(async () => {
  // What does Roger's profile actually point to?
  const { data: roger } = await admin
    .from('profiles')
    .select('id, email, stripe_customer_id, stripe_subscription_id, plan, billing_cycle, subscription_status')
    .eq('email', 'roger.madon@rhm-associates.com')
    .single();
  console.log('Roger profile in Supabase:', JSON.stringify(roger, null, 2));

  if (roger?.stripe_subscription_id) {
    const sub = await stripe.subscriptions.retrieve(roger.stripe_subscription_id, {
      expand: ['discounts'],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const discounts = (sub as any).discounts;
    console.log(`\nSubscription ${sub.id} status=${sub.status}`);
    console.log(`Discounts attached:`, JSON.stringify(discounts, null, 2).slice(0, 600));
  }

  // Also check: are there OTHER active subs for this customer?
  if (roger?.stripe_customer_id) {
    const all = await stripe.subscriptions.list({ customer: roger.stripe_customer_id, status: 'all', limit: 10 });
    console.log(`\nAll subs for customer ${roger.stripe_customer_id}:`);
    for (const s of all.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sub_full = await stripe.subscriptions.retrieve(s.id, { expand: ['discounts'] }) as any;
      console.log(`  ${s.id}  status=${s.status}  created=${new Date(s.created * 1000).toISOString()}  discounts=${(sub_full.discounts ?? []).length}`);
    }
  }
})();
