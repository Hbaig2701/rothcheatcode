/**
 * Pull active subscription create dates and figure out the ARR growth
 * rate from the last 30 / 60 / 90 days, then project forward.
 */

import Stripe from 'stripe';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const TEST_EMAILS = ['hbkidspare+homework@gmail.com', 'allank94@live.com'];

(async () => {
  const subs: Array<{ created: number; arr: number; email: string }> = [];
  let starting_after: string | undefined;
  for (;;) {
    const page = await stripe.subscriptions.list({
      status: 'active',
      limit: 100,
      expand: ['data.latest_invoice', 'data.customer', 'data.discounts'],
      ...(starting_after ? { starting_after } : {}),
    });
    for (const sub of page.data) {
      const customer = sub.customer as Stripe.Customer | string;
      const email = typeof customer === 'string' ? '?' : (customer.email ?? '?');
      if (TEST_EMAILS.includes(email)) continue;
      const item = sub.items.data[0];
      const listPrice = (item.price.unit_amount ?? 0) / 100;
      const interval = item.price.recurring?.interval ?? 'month';
      // discount-adjusted amount
      let amount = listPrice;
      const discounts = (sub as unknown as { discounts?: Array<string | { coupon?: { percent_off?: number; duration?: string } }> }).discounts ?? [];
      for (const d of discounts) {
        if (typeof d === 'object' && d.coupon && d.coupon.duration !== 'once' && d.coupon.percent_off) {
          amount = listPrice * (1 - d.coupon.percent_off / 100);
        }
      }
      if (amount === listPrice) {
        const latest = sub.latest_invoice;
        if (latest && typeof latest === 'object') {
          const tot = (latest as Stripe.Invoice).total ?? 0;
          if (tot > 0) amount = tot / 100;
        }
      }
      const annualAmount = interval === 'year' ? amount : amount * 12;
      subs.push({ created: sub.created, arr: annualAmount, email });
    }
    if (!page.has_more) break;
    starting_after = page.data[page.data.length - 1].id;
  }

  const now = Date.now() / 1000;
  const day = 86400;

  for (const windowDays of [7, 14, 30, 60, 90]) {
    const cutoff = now - windowDays * day;
    const inWindow = subs.filter((s) => s.created >= cutoff);
    const arrAdded = inWindow.reduce((acc, s) => acc + s.arr, 0);
    const perDay = arrAdded / windowDays;
    console.log(`Last ${String(windowDays).padStart(2)}d:  ${String(inWindow.length).padStart(3)} new subs,  +$${arrAdded.toFixed(0).padStart(7)} ARR  (avg $${perDay.toFixed(0)}/day)`);
  }

  const currentARR = subs.reduce((acc, s) => acc + s.arr, 0);
  console.log(`\nCurrent ARR: $${currentARR.toFixed(0)}`);

  // Project off the trailing 30d rate as the "neutral" trajectory.
  const last30 = subs.filter((s) => s.created >= now - 30 * day).reduce((a, s) => a + s.arr, 0);
  const perDay30 = last30 / 30;
  console.log(`\nProjecting at trailing-30d pace ($${perDay30.toFixed(0)}/day ARR added):`);

  const today = new Date();
  for (const target of [150_000, 200_000, 250_000, 500_000, 1_000_000]) {
    const daysNeeded = (target - currentARR) / perDay30;
    const date = new Date(today.getTime() + daysNeeded * 86400 * 1000);
    const label = `$${(target / 1000).toFixed(0)}k`;
    console.log(`  ${label.padEnd(7)}  ${Math.ceil(daysNeeded).toString().padStart(4)}d  →  ${date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
  }
})();
