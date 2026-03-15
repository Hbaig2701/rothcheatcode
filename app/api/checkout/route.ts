import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getStripePriceId } from "@/lib/config/plans";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const plan = searchParams.get("plan") as "standard" | "starter" | "pro";
  const cycle = searchParams.get("cycle") as "monthly" | "annual";

  if (!plan || !cycle || !["standard", "starter", "pro"].includes(plan) || !["monthly", "annual"].includes(cycle)) {
    return NextResponse.redirect(new URL("/plans", request.url));
  }

  try {
    const priceId = getStripePriceId(plan, cycle);

    if (!priceId) {
      return NextResponse.json({ error: "Price not configured. Check STRIPE_PRICE env vars." }, { status: 500 });
    }

    // Check if user is already logged in (existing user upgrading)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    let customerId: string | undefined;
    let userId: string | undefined;
    let userEmail: string | undefined;

    if (user) {
      userId = user.id;
      userEmail = user.email ?? undefined;

      // Check if they already have a Stripe customer ID
      const { data: profile } = await supabase
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", user.id)
        .single();

      if (profile?.stripe_customer_id) {
        customerId = profile.stripe_customer_id;
      }
    }

    // Fall back to email param for unauthenticated checkout (new signups)
    const emailParam = searchParams.get("email");
    if (!customerId && (emailParam || userEmail)) {
      const lookupEmail = emailParam || userEmail;
      if (lookupEmail) {
        const existingCustomers = await stripe.customers.list({ email: lookupEmail, limit: 1 });
        if (existingCustomers.data.length > 0) {
          customerId = existingCustomers.data[0].id;
        }
      }
    }

    const metadata: Record<string, string> = { plan, cycle };
    if (userId) metadata.user_id = userId;

    const sessionParams: Record<string, unknown> = {
      mode: "subscription",
      locale: "en",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: user
        ? `${process.env.NEXT_PUBLIC_APP_URL}/settings?upgraded=true`
        : `${process.env.NEXT_PUBLIC_APP_URL}/welcome?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/plans`,
      billing_address_collection: "required",
      metadata,
      allow_promotion_codes: false, // Disabled - no promo codes at checkout
    };

    // Reuse existing customer if found, otherwise prefill email
    if (customerId) {
      sessionParams.customer = customerId;
    } else if (emailParam || userEmail) {
      sessionParams.customer_email = emailParam || userEmail;
    }

    const session = await stripe.checkout.sessions.create(
      sessionParams as Parameters<typeof stripe.checkout.sessions.create>[0]
    );

    if (!session.url) {
      return NextResponse.json({ error: "Stripe did not return a checkout URL" }, { status: 500 });
    }

    return NextResponse.redirect(session.url, 303);
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
