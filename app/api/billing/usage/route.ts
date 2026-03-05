import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan, getEffectiveOwnerId } from "@/lib/usage";
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
      "plan, billing_cycle, subscription_status, current_period_end, stripe_customer_id, team_owner_id"
    )
    .eq("id", user.id)
    .single();

  // Get current usage
  const now = new Date().toISOString();
  const { data: usage } = await supabase
    .from("usage")
    .select("scenario_runs, pdf_exports")
    .eq("user_id", user.id)
    .gte("period_end", now)
    .order("period_start", { ascending: false })
    .limit(1)
    .single();

  // Get client count
  const { count: clientCount } = await supabase
    .from("clients")
    .select("*", { count: "exact", head: true })
    .eq("user_id", ownerId);

  return NextResponse.json({
    plan,
    isGrandfathered,
    billingCycle: profile?.billing_cycle,
    subscriptionStatus: profile?.subscription_status,
    currentPeriodEnd: profile?.current_period_end,
    hasStripeSubscription: !!profile?.stripe_customer_id,
    isTeamMember: !!profile?.team_owner_id,
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
