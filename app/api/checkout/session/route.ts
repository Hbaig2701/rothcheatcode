import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "customer"],
    });

    if (session.status !== "complete") {
      return NextResponse.json({ error: "Session not complete" }, { status: 400 });
    }

    const subscription = session.subscription as Record<string, unknown> | null;

    return NextResponse.json({
      email: session.customer_details?.email,
      stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
      subscriptionId: subscription?.id,
      plan: session.metadata?.plan,
      cycle: session.metadata?.cycle,
      currentPeriodEnd: subscription?.current_period_end
        ? new Date((subscription.current_period_end as number) * 1000).toISOString()
        : null,
    });
  } catch (error) {
    console.error("Session retrieval error:", error);
    return NextResponse.json({ error: "Failed to retrieve session" }, { status: 500 });
  }
}
