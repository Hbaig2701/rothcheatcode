import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe, getSubscriptionPeriodEnd } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanFromPriceId } from "@/lib/config/plans";
import { PLAN_LIMITS } from "@/lib/config/plans";

/**
 * Remove all team members for a given owner (used on downgrade/cancellation).
 * Sets team_members status to "removed" and clears team_owner_id on member profiles.
 */
async function removeTeamMembers(supabase: ReturnType<typeof createAdminClient>, ownerId: string) {
  // Get all active team members
  const { data: members } = await supabase
    .from("team_members")
    .select("id, member_user_id")
    .eq("team_owner_id", ownerId)
    .neq("status", "removed");

  if (!members || members.length === 0) return;

  // Mark all as removed
  await supabase
    .from("team_members")
    .update({ status: "removed" })
    .eq("team_owner_id", ownerId)
    .neq("status", "removed");

  // Clear team_owner_id on member profiles
  const memberUserIds = members
    .map((m) => m.member_user_id)
    .filter(Boolean) as string[];

  if (memberUserIds.length > 0) {
    await supabase
      .from("profiles")
      .update({ team_owner_id: null })
      .in("id", memberUserIds);
  }

  console.log(`[Stripe Webhook] Removed ${members.length} team members for owner ${ownerId}`);
}

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

          // Try primary lookup by stripe_customer_id
          const { error: updateError, count } = await supabase
            .from("profiles")
            .update(updateData)
            .eq("stripe_customer_id", customerId);

          if (updateError) {
            console.error(`[Stripe Webhook] Failed to update profile for customer ${customerId}:`, updateError);
          } else if (count === 0) {
            // Bug 4 fix: Fallback — fetch customer email from Stripe and try email-based lookup
            console.warn(`[Stripe Webhook] No profile found with stripe_customer_id=${customerId}, trying email fallback`);
            try {
              const customer = await stripe.customers.retrieve(customerId);
              if (!('deleted' in customer && customer.deleted) && customer.email) {
                const { count: emailCount } = await supabase
                  .from("profiles")
                  .update({ ...updateData, stripe_customer_id: customerId })
                  .ilike("email", customer.email);
                if (emailCount && emailCount > 0) {
                  console.log(`[Stripe Webhook] Linked via email fallback: ${customer.email}`);
                  // Also check for team member cleanup after email fallback link
                  const fallbackPlanLimits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.none;
                  if (fallbackPlanLimits.teamMembers === 0) {
                    const { data: fallbackProfile } = await supabase
                      .from("profiles")
                      .select("id")
                      .eq("stripe_customer_id", customerId)
                      .single();
                    if (fallbackProfile) {
                      await removeTeamMembers(supabase, fallbackProfile.id);
                    }
                  }
                } else {
                  console.warn(`[Stripe Webhook] Email fallback also failed for ${customer.email}`);
                }
              }
            } catch (fallbackErr) {
              console.error(`[Stripe Webhook] Email fallback error:`, fallbackErr);
            }
          } else {
            console.log(`[Stripe Webhook] Successfully updated profile: customer=${customerId}, plan=${plan}`);

            // Bug 3 fix: If downgraded to a plan with 0 team members, remove all team members
            const newPlanLimits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.none;
            if (newPlanLimits.teamMembers === 0) {
              // Find the owner profile
              const { data: ownerProfile } = await supabase
                .from("profiles")
                .select("id")
                .eq("stripe_customer_id", customerId)
                .single();
              if (ownerProfile) {
                await removeTeamMembers(supabase, ownerProfile.id);
              }
            }
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

        // Find owner before updating so we can clean up team members
        const { data: ownerProfile } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

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

        // Bug 17 fix: Clean up team members on cancellation
        if (ownerProfile) {
          await removeTeamMembers(supabase, ownerProfile.id);
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
          // Bug 8 fix: Use actual invoice period dates instead of 'now'
          const lines = invoice.lines as unknown as { data?: Array<{ period?: { start?: number; end?: number } }> };
          const periodStart = lines?.data?.[0]?.period?.start;
          const periodEnd = lines?.data?.[0]?.period?.end;
          const now = new Date();
          const start = periodStart
            ? new Date(periodStart * 1000)
            : new Date(now.getFullYear(), now.getMonth(), 1);
          const end = periodEnd
            ? new Date(periodEnd * 1000)
            : new Date(now.getFullYear(), now.getMonth() + 1, 0);

          await supabase.from("usage").upsert(
            {
              user_id: profile.id,
              period_start: start.toISOString().split("T")[0],
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
