import { getStripe } from "@/lib/stripe";

/**
 * Each affiliate can have up to one code per discount tier (20%/10%/5%).
 * One master Stripe Coupon per tier is shared across all affiliates;
 * each affiliate gets their own Stripe Promotion Code per tier (e.g.
 * JANE20, JANE10, JANE5) pointing at the matching master coupon.
 *
 * Coupons are created lazily on first use of each tier. All three are
 * scoped to the annual product only — the program doesn't apply to
 * monthly subscriptions.
 */

export const DISCOUNT_TIERS = [20, 10, 5] as const;
export type DiscountTier = (typeof DISCOUNT_TIERS)[number];

interface TierConfig {
  couponId: string;
  couponName: string;
  // Default commission rate for this tier — lower discount, higher
  // commission. Admin can override per-code if a top performer
  // negotiates a different deal.
  defaultCommissionPct: number;
}

const TIER_CONFIG: Record<DiscountTier, TierConfig> = {
  20: {
    couponId: "AFFILIATE_PROGRAM_20OFF",
    couponName: "Affiliate 20% Off Annual Forever",
    defaultCommissionPct: 25,
  },
  10: {
    couponId: "AFFILIATE_PROGRAM_10OFF",
    couponName: "Affiliate 10% Off Annual Forever",
    defaultCommissionPct: 30,
  },
  5: {
    couponId: "AFFILIATE_PROGRAM_5OFF",
    couponName: "Affiliate 5% Off Annual Forever",
    defaultCommissionPct: 35,
  },
};

export function getTierConfig(tier: DiscountTier): TierConfig {
  return TIER_CONFIG[tier];
}

/**
 * Returns the Stripe Coupon ID for a given discount tier, creating it on
 * first use. Idempotent.
 */
export async function ensureAffiliateCoupon(tier: DiscountTier): Promise<string> {
  const stripe = getStripe();
  const cfg = TIER_CONFIG[tier];
  try {
    await stripe.coupons.retrieve(cfg.couponId);
    return cfg.couponId;
  } catch (err) {
    if ((err as { code?: string }).code !== "resource_missing") throw err;
  }

  const annualPriceId = process.env.STRIPE_PRICE_STANDARD_ANNUAL;
  if (!annualPriceId) {
    throw new Error("STRIPE_PRICE_STANDARD_ANNUAL is not set — cannot scope affiliate coupon to annual plan");
  }

  const annualPrice = await stripe.prices.retrieve(annualPriceId);
  const productId = typeof annualPrice.product === "string"
    ? annualPrice.product
    : annualPrice.product.id;

  await stripe.coupons.create({
    id: cfg.couponId,
    name: cfg.couponName,
    percent_off: tier,
    duration: "forever",
    applies_to: { products: [productId] },
  });

  return cfg.couponId;
}

/**
 * Create a per-affiliate Promotion Code at a given discount tier.
 * Returns the Stripe promotion code ID and the customer-facing code text
 * (uppercased for consistency).
 */
export async function createAffiliatePromotionCode(
  code: string,
  tier: DiscountTier
): Promise<{ promotion_code_id: string; coupon_id: string }> {
  const stripe = getStripe();
  const couponId = await ensureAffiliateCoupon(tier);
  const promo = await stripe.promotionCodes.create({
    promotion: { type: "coupon", coupon: couponId },
    code: code.toUpperCase(),
    active: true,
  });
  return { promotion_code_id: promo.id, coupon_id: couponId };
}

/**
 * Soft-disable a promotion code so new customers can't redeem it.
 * Existing subscribers keep their discount because Stripe records the
 * coupon on the subscription, not on the promotion code.
 */
export async function deactivateAffiliatePromotionCode(promotionCodeId: string): Promise<void> {
  const stripe = getStripe();
  await stripe.promotionCodes.update(promotionCodeId, { active: false });
}

/**
 * Re-activate a previously disabled promotion code.
 */
export async function activateAffiliatePromotionCode(promotionCodeId: string): Promise<void> {
  const stripe = getStripe();
  await stripe.promotionCodes.update(promotionCodeId, { active: true });
}
