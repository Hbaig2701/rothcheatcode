import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { getEffectivePlan, getEffectiveOwnerId, getTeamAdminContext } from "@/lib/usage";
import { getPlanLimits } from "@/lib/config/plans";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { plan, isGrandfathered } = await getEffectivePlan(user.id);
  const limits = getPlanLimits(plan);
  const ownerId = await getEffectiveOwnerId(user.id);

  // Get profile subscription info
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "plan, billing_cycle, subscription_status, current_period_end, stripe_customer_id, stripe_subscription_id, team_owner_id"
    )
    .eq("id", user.id)
    .single();

  // Bug 14 fix: Use ownerId for usage lookup (team members share owner's usage)
  // Must use admin client to bypass RLS (team members can't read owner's usage rows)
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: usage } = await admin
    .from("usage")
    .select("scenario_runs, pdf_exports")
    .eq("user_id", ownerId)
    .gte("period_end", now)
    .order("period_start", { ascending: false })
    .limit(1)
    .single();

  // Get client count (use admin client since team members can't read owner's clients via RLS)
  const { count: clientCount } = await admin
    .from("clients")
    .select("*", { count: "exact", head: true })
    .eq("user_id", ownerId);

  // Fetch trial end date from Stripe if subscription is trialing
  let trialEnd: string | null = null;
  if (
    profile?.subscription_status === "trialing" &&
    profile?.stripe_subscription_id
  ) {
    try {
      const sub = await stripe.subscriptions.retrieve(
        profile.stripe_subscription_id
      );
      if (sub.trial_end) {
        trialEnd = new Date(sub.trial_end * 1000).toISOString();
      }
    } catch (err) {
      console.error("[Billing] Failed to fetch trial info:", err);
    }
  }

  return NextResponse.json({
    plan,
    isGrandfathered,
    billingCycle: profile?.billing_cycle,
    subscriptionStatus: profile?.subscription_status,
    currentPeriodEnd: profile?.current_period_end,
    trialEnd,
    hasStripeSubscription: !!profile?.stripe_customer_id,
    isTeamMember: !!profile?.team_owner_id,
    teamMemberRole: profile?.team_owner_id
      ? (await getTeamAdminContext(user.id))?.role ?? "user"
      : null,
    usage: {
      scenarioRuns: usage?.scenario_runs ?? 0,
      pdfExports: usage?.pdf_exports ?? 0,
      clients: clientCount ?? 0,
    },
    limits: {
      scenarioRuns: limits.scenarioRuns,
      pdfExports: limits.pdfExports,
      clients: limits.clients,
      teamMembers: limits.teamMembers,
    },
  });
}
