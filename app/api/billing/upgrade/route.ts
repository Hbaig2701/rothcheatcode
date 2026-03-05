import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, stripe_subscription_id, billing_cycle")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_customer_id || !profile?.stripe_subscription_id) {
    return NextResponse.json(
      { error: "No subscription found" },
      { status: 400 }
    );
  }

  // Use billing portal with upgrade flow
  const priceId =
    profile.billing_cycle === "annual"
      ? process.env.STRIPE_PRICE_PRO_ANNUAL
      : process.env.STRIPE_PRICE_PRO_MONTHLY;

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings`,
    flow_data: {
      type: "subscription_update_confirm",
      subscription_update_confirm: {
        subscription: profile.stripe_subscription_id,
        items: [{ id: profile.stripe_subscription_id, price: priceId, quantity: 1 }],
      },
    },
  });

  return NextResponse.json({ url: session.url });
}
