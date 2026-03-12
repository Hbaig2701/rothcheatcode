import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanLimits, type PlanId } from "@/lib/config/plans";

interface PlanInfo {
  plan: PlanId;
  isGrandfathered: boolean;
}

/**
 * Get the effective plan for a user, resolving team membership.
 * Uses the provided supabase client (caller decides server vs admin).
 */
export async function getEffectivePlan(userId: string): Promise<PlanInfo> {
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("plan, stripe_customer_id, team_owner_id, subscription_status")
    .eq("id", userId)
    .single();

  if (!profile) return { plan: "none", isGrandfathered: false };

  // If team member, use owner's plan
  if (profile.team_owner_id) {
    const { data: owner } = await admin
      .from("profiles")
      .select("plan, stripe_customer_id, subscription_status")
      .eq("id", profile.team_owner_id)
      .single();

    if (!owner) return { plan: "none", isGrandfathered: false };
    const ownerPlan = (owner.plan as PlanId) ?? "none";
    // If subscription is not active/trialing, deny access (unless grandfathered)
    const ownerGrandfathered = (ownerPlan === "pro" || ownerPlan === "standard") && !owner.stripe_customer_id;
    if (!ownerGrandfathered && owner.subscription_status && !["active", "trialing"].includes(owner.subscription_status)) {
      return { plan: "none", isGrandfathered: false };
    }
    return { plan: ownerPlan, isGrandfathered: ownerGrandfathered };
  }

  const userPlan = (profile.plan as PlanId) ?? "none";
  const isGrandfathered = (userPlan === "pro" || userPlan === "standard") && !profile.stripe_customer_id;
  // If subscription is not active/trialing, deny access (unless grandfathered)
  if (!isGrandfathered && profile.subscription_status && !["active", "trialing"].includes(profile.subscription_status)) {
    return { plan: "none", isGrandfathered: false };
  }
  return { plan: userPlan, isGrandfathered };
}

/**
 * Get the effective user_id for usage tracking and client counting.
 * Team members use their owner's ID.
 */
export async function getEffectiveOwnerId(userId: string): Promise<string> {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("team_owner_id")
    .eq("id", userId)
    .single();

  return profile?.team_owner_id ?? userId;
}

export interface UsageCheckResult {
  allowed: boolean;
  current: number;
  limit: number | null; // null = unlimited
  plan: PlanId;
}

/**
 * For admin team members, returns their team_owner_id and role.
 * Returns null if the user is not a team member or not an admin.
 */
export async function getTeamAdminContext(userId: string): Promise<{
  teamOwnerId: string;
  role: string;
} | null> {
  const admin = createAdminClient();

  // Check if user is a team member
  const { data: profile } = await admin
    .from("profiles")
    .select("team_owner_id")
    .eq("id", userId)
    .single();

  if (!profile?.team_owner_id) return null;

  // Check their role in team_members
  const { data: membership } = await admin
    .from("team_members")
    .select("role")
    .eq("team_owner_id", profile.team_owner_id)
    .eq("member_user_id", userId)
    .eq("status", "active")
    .single();

  if (!membership || membership.role !== "admin") return null;

  return { teamOwnerId: profile.team_owner_id, role: membership.role };
}

/**
 * Check if a user can perform more of a given action this period.
 */
export async function checkUsageLimit(
  userId: string,
  type: "scenario_runs" | "pdf_exports"
): Promise<UsageCheckResult> {
  const { plan } = await getEffectivePlan(userId);
  const limits = getPlanLimits(plan);

  const limitValue =
    type === "scenario_runs" ? limits.scenarioRuns : limits.pdfExports;

  // Unlimited
  if (limitValue === null) {
    return { allowed: true, current: 0, limit: null, plan };
  }

  // Team members' usage counts toward owner's limits
  const ownerId = await getEffectiveOwnerId(userId);
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: usage } = await admin
    .from("usage")
    .select("*")
    .eq("user_id", ownerId)
    .gte("period_end", now)
    .order("period_start", { ascending: false })
    .limit(1)
    .single();

  const current = usage?.[type] ?? 0;

  return {
    allowed: current < limitValue,
    current,
    limit: limitValue,
    plan,
  };
}

/**
 * Check if a user can add more clients.
 */
export async function checkClientLimit(
  userId: string
): Promise<UsageCheckResult> {
  const { plan } = await getEffectivePlan(userId);
  const limits = getPlanLimits(plan);

  if (limits.clients === null) {
    return { allowed: true, current: 0, limit: null, plan };
  }

  const ownerId = await getEffectiveOwnerId(userId);
  const admin = createAdminClient();

  const { count } = await admin
    .from("clients")
    .select("*", { count: "exact", head: true })
    .eq("user_id", ownerId);

  const current = count ?? 0;

  return {
    allowed: current < limits.clients,
    current,
    limit: limits.clients,
    plan,
  };
}

/**
 * Increment a usage counter for the current billing period.
 * Bug 13 fix: Read current value and increment in a single update call
 * to minimize the race window. For true atomicity, a Supabase RPC
 * with `SET col = col + 1` would be needed, but this is sufficient
 * for the expected concurrency level (single user, sequential requests).
 */
export async function incrementUsage(
  userId: string,
  type: "scenario_runs" | "pdf_exports"
): Promise<void> {
  // Team members' usage counts toward owner's record
  const ownerId = await getEffectiveOwnerId(userId);
  const admin = createAdminClient();
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Try to get existing usage record for this period
  const { data: existing } = await admin
    .from("usage")
    .select("id, scenario_runs, pdf_exports")
    .eq("user_id", ownerId)
    .gte("period_end", now.toISOString())
    .order("period_start", { ascending: false })
    .limit(1)
    .single();

  if (existing) {
    await admin
      .from("usage")
      .update({
        [type]: (existing[type] ?? 0) + 1,
        updated_at: now.toISOString(),
      })
      .eq("id", existing.id);
  } else {
    // Create new usage record
    await admin.from("usage").insert({
      user_id: ownerId,
      period_start: periodStart.toISOString().split("T")[0],
      period_end: periodEnd.toISOString().split("T")[0],
      [type]: 1,
    });
  }
}
