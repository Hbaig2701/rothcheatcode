/**
 * Run the EXACT logic from the fixed admin revenue route against
 * Mazhar and Roger's subscriptions to verify they now compute to
 * $1930.50/yr, not $2970.
 */

import Stripe from 'stripe';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const SUBS = [
  { name: 'Mazhar', sub: 'sub_1TcB3U1ZCHzsib1gTooU8H0O', expected: 1930.50 },
  { name: 'Roger', sub: 'sub_1TcB7p1ZCHzsib1gkKQforQG', expected: 1930.50 },
];

// Shared coupon cache (matches the route)
const couponCache = new Map<string, { percent_off: number | null; amount_off: number | null; duration: string }>();
const fetchCoupon = async (couponId: string) => {
  const cached = couponCache.get(couponId);
  if (cached) return cached;
  try {
    const c = await stripe.coupons.retrieve(couponId);
    const entry = {
      percent_off: c.percent_off ?? null,
      amount_off: c.amount_off ?? null,
      duration: c.duration ?? 'once',
    };
    couponCache.set(couponId, entry);
    return entry;
  } catch {
    return null;
  }
};

(async () => {
  let allPass = true;
  for (const t of SUBS) {
    const sub = await stripe.subscriptions.retrieve(t.sub, {
      expand: ['latest_invoice', 'discounts'],
    });
    const item = sub.items.data[0];
    const listPrice = (item.price.unit_amount ?? 0) / 100;

    let amount: number | null = null;
    const expandedDiscounts = (sub as unknown as {
      discounts?: Array<string | { source?: { type?: string; coupon?: string | null } }>;
    }).discounts ?? [];
    for (const d of expandedDiscounts) {
      if (typeof d !== 'object' || !d) continue;
      const src = d.source;
      if (!src || src.type !== 'coupon' || !src.coupon) continue;
      const coupon = await fetchCoupon(src.coupon);
      if (!coupon) continue;
      if (coupon.duration === 'once') continue;
      if (coupon.percent_off) {
        amount = listPrice * (1 - coupon.percent_off / 100);
      } else if (coupon.amount_off) {
        amount = Math.max(0, listPrice - coupon.amount_off / 100);
      }
      if (amount !== null) break;
    }

    if (amount === null) {
      const li = sub.latest_invoice;
      if (li && typeof li === 'object') {
        const tot = (li as Stripe.Invoice).total ?? 0;
        const paid = (li as Stripe.Invoice).amount_paid ?? 0;
        if (tot > 0) amount = tot / 100;
        else if (paid > 0) amount = paid / 100;
      }
    }
    if (amount === null) amount = listPrice;

    const pass = Math.abs(amount - t.expected) < 0.01;
    const mark = pass ? '✓' : '✗';
    console.log(`${mark} ${t.name}: $${amount.toFixed(2)}/yr  (expected $${t.expected}/yr)`);
    if (!pass) allPass = false;
  }
  console.log(allPass ? '\nALL PASS' : '\nFAILED');
  process.exit(allPass ? 0 : 1);
})();
