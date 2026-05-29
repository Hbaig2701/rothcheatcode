/**
 * List all completed Stripe Checkout Sessions from today (local time).
 * Each row shows email, name, plan, amount, and the welcome link so we
 * can hand it to the customer if they're stuck.
 *
 * Usage: npx tsx scripts/list-signups-today.ts
 */

import Stripe from 'stripe';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const stripeKey = process.env.STRIPE_SECRET_KEY;
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.retirementexpert.ai';
if (!stripeKey) {
  console.error('Missing STRIPE_SECRET_KEY');
  process.exit(1);
}

const stripe = new Stripe(stripeKey);

(async () => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const sinceUnix = Math.floor(startOfToday.getTime() / 1000);

  const sessions = await stripe.checkout.sessions.list({
    created: { gte: sinceUnix },
    limit: 100,
  });

  const completed = sessions.data.filter((s) => s.status === 'complete');

  if (completed.length === 0) {
    console.log('No completed signups today.');
    process.exit(0);
  }

  console.log(`\nFound ${completed.length} completed signup(s) today:\n`);
  for (const s of completed) {
    const email = s.customer_details?.email ?? '—';
    const name = s.customer_details?.name ?? '—';
    const plan = s.metadata?.plan ?? '?';
    const cycle = s.metadata?.cycle ?? '?';
    const amount = typeof s.amount_total === 'number' ? `$${(s.amount_total / 100).toFixed(2)}` : '—';
    const time = new Date(s.created * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    console.log(`${time}  ${name}  <${email}>  ${plan}/${cycle}  ${amount}`);
    console.log(`  Welcome link: ${appUrl}/welcome?session_id=${s.id}`);
    console.log('');
  }
  process.exit(0);
})();
