import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Returns true when the signed-in user (or their team owner) has an active
 * subscription or is grandfathered. Mirrors the access logic in
 * app/(dashboard)/layout.tsx but as a boolean for API routes — they need
 * to fail fast with 403 instead of redirecting.
 *
 * Without this check, a user with a lapsed subscription can still hit
 * /api/chat (or any other dashboard API) and incur Anthropic cost we
 * never get paid for.
 */
const ACTIVE_PLANS = new Set(["standard", "starter", "pro"]);
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export async function hasActiveSubscription(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, subscription_status, stripe_customer_id, team_owner_id, role")
    .eq("id", userId)
    .single();

  // No profile row at all — fall through to checking app_metadata for
  // admin role. Without this, a user with a missing/corrupt profile row
  // who is actually an admin (set via Supabase auth metadata) would be
  // locked out. Independent users with no profile still return false.
  if (!profile) {
    const { data: { user } } = await supabase.auth.getUser();
    const metaRole = (user?.app_metadata as { role?: string } | null)?.role;
    return metaRole === "admin";
  }
  if (profile.role === "admin") return true;

  // Team member: check the team owner's subscription (admin client to
  // bypass RLS since this user can't read another user's profile).
  if (profile.team_owner_id) {
    const admin = createAdminClient();
    const { data: owner } = await admin
      .from("profiles")
      .select("plan, subscription_status, stripe_customer_id")
      .eq("id", profile.team_owner_id)
      .single();
    if (!owner) return false;
    const ownerGrandfathered =
      (owner.plan === "pro" || owner.plan === "standard") && !owner.stripe_customer_id;
    const ownerActive =
      ACTIVE_PLANS.has(owner.plan ?? "") && ACTIVE_STATUSES.has(owner.subscription_status ?? "");
    return ownerGrandfathered || ownerActive;
  }

  // Owner or independent user.
  const grandfathered =
    (profile.plan === "pro" || profile.plan === "standard") && !profile.stripe_customer_id;
  const active =
    ACTIVE_PLANS.has(profile.plan ?? "") && ACTIVE_STATUSES.has(profile.subscription_status ?? "");
  return grandfathered || active;
}
