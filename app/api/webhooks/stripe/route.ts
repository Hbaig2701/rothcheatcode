import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe, getSubscriptionPeriodEnd } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanFromPriceId } from "@/lib/config/plans";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET env var is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createAdminClient();

  console.log(`[Stripe Webhook] Received event: ${event.type} (${event.id})`);

  try {
    switch (event.type) {
      // =================================================================
      // CHECKOUT COMPLETED — Links Stripe customer to Supabase profile
      // This fires BEFORE the user completes the welcome form, so it acts
      // as a safety net. The welcome route also writes stripe_customer_id,
      // but if the user never completes welcome, this ensures the link exists.
      // =================================================================
      case "checkout.session.completed": {
        const session = event.data.object as unknown as Record<string, unknown>;
        const customerId = session.customer as string;
        const customerEmail = (session.customer_details as Record<string, unknown>)?.email as string | undefined;
        const metadata = session.metadata as Record<string, string> | undefined;
        const plan = metadata?.plan;
        const cycle = metadata?.cycle;
        const userId = metadata?.user_id;

        console.log(`[Stripe Webhook] checkout.session.completed: customer=${customerId}, email=${customerEmail}, plan=${plan}, cycle=${cycle}, user_id=${userId}`);

        if (customerId) {
          let profile: { id: string; stripe_customer_id: string | null } | null = null;

          // First try to find profile by user_id from metadata (most reliable)
          if (userId) {
            const { data } = await supabase
              .from("profiles")
              .select("id, stripe_customer_id")
              .eq("id", userId)
              .single();
            profile = data;
          }

          // Fall back to email lookup
          if (!profile && customerEmail) {
            const { data } = await supabase
              .from("profiles")
              .select("id, stripe_customer_id")
              .ilike("email", customerEmail)
              .single();
            profile = data;
          }

          if (profile) {
            const updateData: Record<string, unknown> = { stripe_customer_id: customerId };
            if (plan) updateData.plan = plan;
            if (cycle) updateData.billing_cycle = cycle;
            updateData.subscription_status = "active";

            await supabase
              .from("profiles")
              .update(updateData)
              .eq("id", profile.id);

            console.log(`[Stripe Webhook] Linked customer ${customerId} to profile ${profile.id}`);
          } else {
            // Profile doesn't exist yet (user hasn't completed welcome form)
            // The welcome route will handle linking when it creates the user
            console.log(`[Stripe Webhook] No profile found for user_id=${userId} or email=${customerEmail}, welcome route will handle linking`);
          }
        }
        break;
      }

      // =================================================================
      // SUBSCRIPTION CREATED / UPDATED — Updates plan, cycle, status
      // =================================================================
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const subscription = event.data.object as unknown as Record<string, unknown>;
        const customerId = subscription.customer as string;
        const items = subscription.items as { data: Array<{ price: { id: string }; current_period_end?: number }> };
        const priceId = items?.data[0]?.price.id;
        const periodEndIso = getSubscriptionPeriodEnd(subscription);

        console.log(`[Stripe Webhook] ${event.type}: customer=${customerId}, priceId=${priceId}, status=${subscription.status}, periodEnd=${periodEndIso}`);

        if (priceId) {
          const planResult = getPlanFromPriceId(priceId);
          if (!planResult) {
            console.error(`[Stripe Webhook] Unknown priceId=${priceId}, skipping plan update to avoid downgrade`);
            break;
          }
          const { plan, cycle } = planResult;
          console.log(`[Stripe Webhook] Mapped priceId=${priceId} → plan=${plan}, cycle=${cycle}`);

          const updateData: Record<string, unknown> = {
            plan,
            billing_cycle: cycle,
            subscription_status: subscription.status as string,
            stripe_subscription_id: subscription.id as string,
          };
          if (periodEndIso) {
            updateData.current_period_end = periodEndIso;
          }

          const { error: updateError, count } = await supabase
            .from("profiles")
            .update(updateData)
            .eq("stripe_customer_id", customerId);

          if (updateError) {
            console.error(`[Stripe Webhook] Failed to update profile for customer ${customerId}:`, updateError);
          } else if (count === 0) {
            console.warn(`[Stripe Webhook] No profile found with stripe_customer_id=${customerId}. User may not have completed onboarding yet.`);
          } else {
            console.log(`[Stripe Webhook] Successfully updated profile: customer=${customerId}, plan=${plan}`);
          }
        } else {
          console.warn(`[Stripe Webhook] No priceId found in subscription items`);
        }
        break;
      }

      // =================================================================
      // SUBSCRIPTION DELETED — Cancellation, clear all billing fields
      // =================================================================
      case "customer.subscription.deleted": {
        const subscription = event.data.object as unknown as Record<string, unknown>;
        const customerId = subscription.customer as string;

        console.log(`[Stripe Webhook] subscription.deleted: customer=${customerId}`);

        const { error: deleteError, count } = await supabase
          .from("profiles")
          .update({
            plan: "none",
            subscription_status: "canceled",
            stripe_subscription_id: null,
            billing_cycle: null,
            current_period_end: null,
          })
          .eq("stripe_customer_id", customerId);

        if (deleteError) {
          console.error(`[Stripe Webhook] Failed to cancel profile for customer ${customerId}:`, deleteError);
        } else if (count === 0) {
          console.warn(`[Stripe Webhook] No profile found with stripe_customer_id=${customerId} for cancellation`);
        } else {
          console.log(`[Stripe Webhook] Canceled subscription for customer=${customerId}`);
        }
        break;
      }

      // =================================================================
      // INVOICE PAYMENT FAILED — Mark as past_due
      // =================================================================
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        console.log(`[Stripe Webhook] invoice.payment_failed: customer=${customerId}`);

        const { error, count } = await supabase
          .from("profiles")
          .update({ subscription_status: "past_due" })
          .eq("stripe_customer_id", customerId);

        if (error) {
          console.error(`[Stripe Webhook] Failed to mark past_due for customer ${customerId}:`, error);
        } else if (count === 0) {
          console.warn(`[Stripe Webhook] No profile found with stripe_customer_id=${customerId} for payment_failed`);
        }
        break;
      }

      // =================================================================
      // INVOICE PAID — Reactivate + reset usage counters
      // =================================================================
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        console.log(`[Stripe Webhook] invoice.paid: customer=${customerId}`);

        // Update status to active
        const { error: statusError } = await supabase
          .from("profiles")
          .update({ subscription_status: "active" })
          .eq("stripe_customer_id", customerId);

        if (statusError) {
          console.error(`[Stripe Webhook] Failed to update status for customer ${customerId}:`, statusError);
        }

        // Reset usage counters for new billing period
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (profile) {
          // Try to get period end from invoice lines
          const lines = invoice.lines as unknown as { data?: Array<{ period?: { end?: number } }> };
          const periodEnd = lines?.data?.[0]?.period?.end;
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
        } else {
          console.warn(`[Stripe Webhook] No profile found for customer ${customerId} to reset usage`);
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
