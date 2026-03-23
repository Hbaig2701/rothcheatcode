import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getStripePriceId } from "@/lib/config/plans";

/**
 * Private trial checkout route.
 * Creates a Stripe Checkout session with a 7-day free trial on Pro Monthly
 * plus a one-time $1 setup fee. Share the URL directly:
 *   https://retirementexpert.ai/api/checkout/trial
 */
export async function GET(request: NextRequest) {
  try {
    const priceId = getStripePriceId("pro", "monthly");

    if (!priceId) {
      return NextResponse.json(
        { error: "Price not configured." },
        { status: 500 }
      );
    }

    const trialSetupPriceId = process.env.STRIPE_PRICE_TRIAL_SETUP;
    if (!trialSetupPriceId) {
      return NextResponse.json(
        { error: "Trial setup price not configured." },
        { status: 500 }
      );
    }

    const sessionParams: Record<string, unknown> = {
      mode: "subscription",
      locale: "en",
      payment_method_types: ["card"],
      line_items: [
        { price: priceId, quantity: 1 },
        { price: trialSetupPriceId, quantity: 1 },
      ],
      subscription_data: {
        trial_period_days: 7,
        metadata: { plan: "pro", cycle: "monthly" },
      },
      metadata: { plan: "pro", cycle: "monthly" },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/welcome?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/plans`,
      billing_address_collection: "required",
      allow_promotion_codes: true,
    };

    const session = await stripe.checkout.sessions.create(
      sessionParams as Parameters<typeof stripe.checkout.sessions.create>[0]
    );

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL" },
        { status: 500 }
      );
    }

    return NextResponse.redirect(session.url, 303);
  } catch (error) {
    console.error("Trial checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create trial checkout" },
      { status: 500 }
    );
  }
}
