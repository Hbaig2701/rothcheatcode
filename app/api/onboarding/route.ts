/**
 * GET  /api/onboarding — read the advisor's onboarding video status
 * POST /api/onboarding — record an event:
 *     { event: "dismissed" | "started" | "completed" }
 *
 * Drives the first-login modal (only shows when neither dismissed_at
 * nor completed_at is set) AND the admin funnel ("how far did each
 * advisor get?"). Each event timestamps a column on user_settings —
 * the columns are idempotent (only set if NULL) so replaying an
 * event from the client doesn't keep moving the timestamp forward.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type OnboardingEvent = "dismissed" | "started" | "completed";

interface PostBody {
  event: OnboardingEvent;
}

const EVENT_TO_COLUMN: Record<OnboardingEvent, string> = {
  dismissed: "onboarding_video_dismissed_at",
  started: "onboarding_video_started_at",
  completed: "onboarding_video_completed_at",
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Ensure a user_settings row exists. We use the same upsert pattern
  // as /api/settings so a brand-new user's first hit doesn't fail with
  // PGRST116 ("no rows").
  let { data, error } = await supabase
    .from("user_settings")
    .select("onboarding_video_dismissed_at, onboarding_video_started_at, onboarding_video_completed_at")
    .eq("user_id", user.id)
    .single();

  if (error?.code === "PGRST116") {
    const { data: inserted, error: insertErr } = await supabase
      .from("user_settings")
      .insert({ user_id: user.id })
      .select("onboarding_video_dismissed_at, onboarding_video_started_at, onboarding_video_completed_at")
      .single();
    if (insertErr) {
      console.error("[onboarding] settings insert failed", insertErr.message);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
    data = inserted;
    error = null;
  }
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to load" }, { status: 500 });
  }

  return NextResponse.json({
    dismissed_at: data.onboarding_video_dismissed_at,
    started_at: data.onboarding_video_started_at,
    completed_at: data.onboarding_video_completed_at,
    // Helper the modal uses directly: show the takeover only if the
    // advisor has neither finished nor explicitly dismissed it.
    should_show_modal:
      data.onboarding_video_dismissed_at === null &&
      data.onboarding_video_completed_at === null,
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PostBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const column = EVENT_TO_COLUMN[body.event];
  if (!column) {
    return NextResponse.json(
      { error: "event must be one of: dismissed, started, completed" },
      { status: 400 },
    );
  }

  // Only set the column if it's still NULL — idempotent. A re-fired
  // "started" event when the user replays the video shouldn't bump
  // the timestamp forward; we want the FIRST start time preserved.
  // Similarly, replaying "completed" shouldn't overwrite the original
  // completion timestamp. (PostgREST has no native "set if null", so
  // we read first then conditional-write.)
  const { data: current } = await supabase
    .from("user_settings")
    .select(column)
    .eq("user_id", user.id)
    .single();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const alreadySet = current && (current as any)[column] !== null;
  if (alreadySet) {
    return NextResponse.json({ ok: true, already_set: true });
  }

  const { error: updateErr } = await supabase
    .from("user_settings")
    .update({ [column]: new Date().toISOString() })
    .eq("user_id", user.id);

  if (updateErr) {
    console.error("[onboarding] event update failed", { event: body.event, error: updateErr.message });
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
