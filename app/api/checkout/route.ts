import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getStripePriceId } from "@/lib/config/plans";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const plan = searchParams.get("plan") as "starter" | "pro";
  const cycle = searchParams.get("cycle") as "monthly" | "annual";

  if (!plan || !cycle || !["starter", "pro"].includes(plan) || !["monthly", "annual"].includes(cycle)) {
    return NextResponse.redirect(new URL("/pricing", request.url));
  }

  try {
    const priceId = getStripePriceId(plan, cycle);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/welcome?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
      allow_promotion_codes: true,
      billing_address_collection: "required",
      customer_creation: "always",
      metadata: { plan, cycle },
    });

    return NextResponse.redirect(session.url!);
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.redirect(new URL("/pricing?error=checkout_failed", request.url));
  }
}
