/**
 * Roger has 3 Stripe customer records (one per Checkout Session). Earlier
 * I attached the MAYELITE coupon to sub_1TcB7p... on cus_UbNt... — but
 * Roger's Supabase profile actually points to sub_1TcB44... on cus_UbNp...
 *
 * Attach the coupon to the correct subscription so the admin dashboard
 * shows $1930.50/yr. The other two subs (on different customers) were
 * the refunded charges; we'll cancel them so they stop billing.
 */

import Stripe from 'stripe';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const COUPON_ID = 'ulKkqVBl';                          // MAYELITE 35% off forever
const ACTIVE_SUB = 'sub_1TcB441ZCHzsib1ghXvcVJPe';     // The one linked to Roger's profile
const STALE_SUBS = [
  'sub_1TcB7p1ZCHzsib1gkKQforQG',                       // had the coupon by mistake (refunded charge)
];

(async () => {
  // 1. Apply coupon to the correct active sub
  const updated = await stripe.subscriptions.update(ACTIVE_SUB, {
    discounts: [{ coupon: COUPON_ID }],
  });
  const fresh = await stripe.subscriptions.retrieve(updated.id, { expand: ['discounts'] });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const newDiscounts = (fresh as any).discounts ?? [];
  console.log(`✓ Applied coupon to ${ACTIVE_SUB}: ${newDiscounts.length} discount(s) now attached`);

  // 2. Check the stale subs — if still active, cancel them (these were
  //    duplicate payments that were already refunded; they shouldn't
  //    continue to bill on renewal).
  for (const subId of STALE_SUBS) {
    try {
      const sub = await stripe.subscriptions.retrieve(subId);
      console.log(`\nStale sub ${subId}: status=${sub.status} cancel_at_period_end=${sub.cancel_at_period_end}`);
      if (sub.status === 'active' && !sub.cancel_at_period_end) {
        console.log(`  → flagging for cancel at period end (so no surprise charges)`);
        await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
        console.log(`  ✓ marked cancel_at_period_end=true`);
      }
    } catch (err) {
      console.log(`  (skipped — ${err instanceof Error ? err.message : err})`);
    }
  }
})();
