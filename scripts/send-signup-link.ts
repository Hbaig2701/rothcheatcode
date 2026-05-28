/**
 * Manually send a "continue signup" recovery email to a customer who paid
 * but never finished the /welcome form.
 *
 * Usage:
 *   npx tsx scripts/send-signup-link.ts <email>
 *
 * Looks up the customer's most recent COMPLETE Checkout Session in Stripe
 * and emails them a link to /welcome?session_id=<session_id>.
 *
 * Best used when:
 *   - You see a Slack "New Customer Signup!" message
 *   - The customer says they can't log in / never saw the password screen
 *   - You want to nudge them through setup
 */

import Stripe from 'stripe';
import { config } from 'dotenv';
import { resolve } from 'path';
import { sendSignupContinuationEmail } from '../lib/notifications/email';

config({ path: resolve(process.cwd(), '.env.local') });

const email = process.argv[2];
if (!email) {
  console.error('Usage: npx tsx scripts/send-signup-link.ts <email>');
  process.exit(1);
}

const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  console.error('Missing STRIPE_SECRET_KEY in .env.local');
  process.exit(1);
}

const stripe = new Stripe(stripeKey);

(async () => {
  // 1. Find the customer.
  const customers = await stripe.customers.list({ email, limit: 1 });
  if (customers.data.length === 0) {
    console.error(`No Stripe customer found for ${email}`);
    process.exit(1);
  }
  const customer = customers.data[0];
  console.log(`Customer: ${customer.id} (${customer.email})`);

  // 2. Find their most recent completed Checkout Session.
  const sessions = await stripe.checkout.sessions.list({
    customer: customer.id,
    limit: 10,
  });
  const completedSession = sessions.data.find((s) => s.status === 'complete');
  if (!completedSession) {
    console.error(`No completed Checkout Session found for customer ${customer.id}`);
    process.exit(1);
  }
  console.log(`Session: ${completedSession.id}  amount=${completedSession.amount_total}  plan=${completedSession.metadata?.plan}`);

  // 3. Pull first name from the customer record (if Stripe captured it).
  const fullName = completedSession.customer_details?.name || customer.name || null;
  const firstName = fullName ? fullName.split(' ')[0] : null;

  // 4. Send the recovery email.
  await sendSignupContinuationEmail({
    to: email,
    sessionId: completedSession.id,
    firstName,
  });

  console.log(`\n--- DONE ---`);
  console.log(`Sent continuation email to ${email}`);
  console.log(`Link: ${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.retirementexpert.ai'}/welcome?session_id=${completedSession.id}`);
  process.exit(0);
})();
