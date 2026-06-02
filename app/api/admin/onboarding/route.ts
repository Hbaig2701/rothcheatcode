/**
 * GET /api/admin/onboarding — funnel + per-advisor breakdown for the
 * onboarding video.
 *
 * Admin-only. Returns:
 *   - totals: { advisors, dismissed_no_watch, started, completed }
 *   - advisors: per-row state (email, dismissed_at, started_at,
 *     completed_at, account_created_at) — newest accounts first
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { fetchInternalTeamProfileIds } from "@/lib/auth/internal-team";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  await requireAdmin(supabase, user);

  const admin = createAdminClient();

  // Internal team (Vroom employees) get excluded from the funnel so
  // their test logins don't pollute the metrics — same convention as
  // the AI Chat dashboard.
  const internalIds = await fetchInternalTeamProfileIds(admin);
  const SENTINEL = "00000000-0000-0000-0000-000000000000";
  const excludedIds = internalIds.length > 0 ? internalIds : [SENTINEL];

  // Pull every advisor + their onboarding columns. Joined with
  // profiles for the email/name; profile rows are the canonical
  // "advisor exists" set, user_settings might be missing for the
  // freshest accounts that haven't hit /api/settings yet.
  const [{ data: profileRows }, { data: settingsRows }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, email, created_at")
      .not("id", "in", `(${excludedIds.join(",")})`)
      .order("created_at", { ascending: false }),
    admin
      .from("user_settings")
      .select(
        "user_id, first_name, last_name, onboarding_video_dismissed_at, onboarding_video_started_at, onboarding_video_completed_at",
      ),
  ]);

  const settingsByUser = new Map(
    (settingsRows ?? []).map((s) => [s.user_id, s]),
  );

  const advisors = (profileRows ?? []).map((p) => {
    const s = settingsByUser.get(p.id);
    const name = [s?.first_name, s?.last_name].filter(Boolean).join(" ").trim() || null;
    return {
      user_id: p.id,
      email: p.email,
      name,
      account_created_at: p.created_at,
      dismissed_at: s?.onboarding_video_dismissed_at ?? null,
      started_at: s?.onboarding_video_started_at ?? null,
      completed_at: s?.onboarding_video_completed_at ?? null,
    };
  });

  const totals = {
    advisors: advisors.length,
    completed: advisors.filter((a) => a.completed_at).length,
    started_not_completed: advisors.filter((a) => a.started_at && !a.completed_at).length,
    dismissed_no_watch: advisors.filter((a) => a.dismissed_at && !a.started_at && !a.completed_at).length,
    never_engaged: advisors.filter(
      (a) => !a.dismissed_at && !a.started_at && !a.completed_at,
    ).length,
  };

  return NextResponse.json({ totals, advisors });
}
