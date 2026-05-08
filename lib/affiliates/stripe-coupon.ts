import { getStripe } from "@/lib/stripe";

/**
 * The shared master Coupon every affiliate's Promotion Code points at.
 * One coupon, many promotion codes. The discount itself is identical
 * across all affiliates — what varies per-affiliate is the customer-facing
 * code string AND the commission rate (stored in our DB, not Stripe).
 */
const COUPON_ID = "AFFILIATE_PROGRAM_20OFF";
const COUPON_NAME = "Affiliate Program — 20% Off Forever (Annual Only)";
const DISCOUNT_PERCENT = 20;

/**
 * Returns the Stripe Coupon ID, creating it on first use. Idempotent —
 * subsequent calls just retrieve the existing coupon. Restricted to the
 * annual price so customers can't accidentally redeem an affiliate code
 * on a monthly subscription.
 */
export async function ensureAffiliateCoupon(): Promise<string> {
  const stripe = getStripe();
  try {
    await stripe.coupons.retrieve(COUPON_ID);
    return COUPON_ID;
  } catch (err) {
    // Stripe throws StripeInvalidRequestError on missing coupon — create it.
    if ((err as { code?: string }).code !== "resource_missing") throw err;
  }

  const annualPriceId = process.env.STRIPE_PRICE_STANDARD_ANNUAL;
  if (!annualPriceId) {
    throw new Error("STRIPE_PRICE_STANDARD_ANNUAL is not set — cannot scope affiliate coupon to annual plan");
  }

  // Look up the product the annual price belongs to so we can scope the
  // coupon to that product (Stripe's applies_to.products).
  const annualPrice = await stripe.prices.retrieve(annualPriceId);
  const productId = typeof annualPrice.product === "string"
    ? annualPrice.product
    : annualPrice.product.id;

  await stripe.coupons.create({
    id: COUPON_ID,
    name: COUPON_NAME,
    percent_off: DISCOUNT_PERCENT,
    duration: "forever",
    applies_to: { products: [productId] },
  });

  return COUPON_ID;
}

/**
 * Create a per-affiliate Promotion Code that references the shared coupon.
 * Returns the Stripe promotion code ID (promo_xxx). The customer-facing
 * string is `code` (e.g. "JOSH20") — must be 3-50 chars, alphanumeric +
 * hyphen/underscore.
 */
export async function createAffiliatePromotionCode(code: string): Promise<{
  promotion_code_id: string;
}> {
  const stripe = getStripe();
  const couponId = await ensureAffiliateCoupon();
  // The Stripe SDK's PromotionCodeCreateParams (acacia 2025-12-18) wraps the
  // coupon inside a `promotion` object with a discriminated `type`. Using
  // the top-level `coupon` parameter (still accepted at runtime) trips a
  // TS error, so we use the typed wrapper.
  const promo = await stripe.promotionCodes.create({
    promotion: { type: "coupon", coupon: couponId },
    code: code.toUpperCase(),
    active: true,
  });
  return { promotion_code_id: promo.id };
}

/**
 * Soft-disable a promotion code (cannot be redeemed by new customers, but
 * existing subscribers keep their discount because Stripe records the
 * discount on the subscription itself, not on the promotion code).
 */
export async function deactivateAffiliatePromotionCode(promotionCodeId: string): Promise<void> {
  const stripe = getStripe();
  await stripe.promotionCodes.update(promotionCodeId, { active: false });
}
