import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanFromPriceId } from "@/lib/config/plans";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createAdminClient();

  console.log(`[Stripe Webhook] Received event: ${event.type} (${event.id})`);

  try {
    switch (event.type) {
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const subscription = event.data.object as unknown as Record<string, unknown>;
        const customerId = subscription.customer as string;
        const items = subscription.items as { data: Array<{ price: { id: string }; current_period_end?: number }> };
        const priceId = items?.data[0]?.price.id;

        // current_period_end may be at root (older API) or on item (2026+ API)
        const periodEndTs = (subscription.current_period_end as number | undefined)
          ?? items?.data[0]?.current_period_end;

        console.log(`[Stripe Webhook] ${event.type}: customer=${customerId}, priceId=${priceId}, status=${subscription.status}, periodEnd=${periodEndTs}`);

        if (priceId) {
          const { plan, cycle } = getPlanFromPriceId(priceId);
          console.log(`[Stripe Webhook] Mapped priceId=${priceId} → plan=${plan}, cycle=${cycle}`);

          const updateData: Record<string, unknown> = {
            plan,
            billing_cycle: cycle,
            subscription_status: subscription.status as string,
            stripe_subscription_id: subscription.id as string,
          };
          if (periodEndTs) {
            updateData.current_period_end = new Date(periodEndTs * 1000).toISOString();
          }

          const { error: updateError } = await supabase
            .from("profiles")
            .update(updateData)
            .eq("stripe_customer_id", customerId);

          if (updateError) {
            console.error(`[Stripe Webhook] Failed to update profile for customer ${customerId}:`, updateError);
          } else {
            console.log(`[Stripe Webhook] Successfully updated profile: customer=${customerId}, plan=${plan}`);
          }
        } else {
          console.warn(`[Stripe Webhook] No priceId found in subscription items`);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as unknown as Record<string, unknown>;
        const customerId = subscription.customer as string;

        await supabase
          .from("profiles")
          .update({
            plan: "none",
            subscription_status: "canceled",
          })
          .eq("stripe_customer_id", customerId);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        await supabase
          .from("profiles")
          .update({ subscription_status: "past_due" })
          .eq("stripe_customer_id", customerId);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Update status to active
        await supabase
          .from("profiles")
          .update({ subscription_status: "active" })
          .eq("stripe_customer_id", customerId);

        // Reset usage counters for new billing period
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (profile) {
          const periodEnd = invoice.lines.data[0]?.period?.end;
          const now = new Date();
          const end = periodEnd
            ? new Date(periodEnd * 1000)
            : new Date(now.getFullYear(), now.getMonth() + 1, 0);

          await supabase.from("usage").upsert(
            {
              user_id: profile.id,
              period_start: now.toISOString().split("T")[0],
              period_end: end.toISOString().split("T")[0],
              scenario_runs: 0,
              pdf_exports: 0,
            },
            { onConflict: "user_id,period_start" }
          );
        }
        break;
      }
    }
  } catch (error) {
    console.error("Webhook handler error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
