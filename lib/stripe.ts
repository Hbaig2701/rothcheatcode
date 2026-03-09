import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-02-25.clover",
      typescript: true,
    });
  }
  return _stripe;
}

/**
 * Extract current_period_end from a subscription object.
 * Handles both older API (root-level) and 2026+ API (on items.data[0]).
 */
export function getSubscriptionPeriodEnd(subscription: Record<string, unknown> | null): string | null {
  if (!subscription) return null;
  const rootTs = subscription.current_period_end as number | undefined;
  if (rootTs) return new Date(rootTs * 1000).toISOString();
  const items = subscription.items as { data: Array<{ current_period_end?: number }> } | undefined;
  const itemTs = items?.data?.[0]?.current_period_end;
  if (itemTs) return new Date(itemTs * 1000).toISOString();
  return null;
}

// Convenience export — lazily initialized
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as unknown as Record<string, unknown>)[prop as string];
  },
});
