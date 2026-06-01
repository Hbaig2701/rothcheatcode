/**
 * PATCH /api/admin/chat-flags/[id] — mark a flag reviewed (or un-review).
 *
 * Body shape:
 *   { action: "review", note?: string }   sets reviewed_at = now(), reviewed_by = me, reviewer_note = note
 *   { action: "unreview" }                clears reviewed_at, reviewed_by, reviewer_note
 *
 * The admin RLS UPDATE policy on chat_assistant_flags covers this, but we
 * also re-check admin role here so a misconfigured policy doesn't open a
 * back door.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";

export const dynamic = "force-dynamic";

interface PatchBody {
  action: "review" | "unreview";
  note?: string;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  await requireAdmin(supabase, user);

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action !== "review" && body.action !== "unreview") {
    return NextResponse.json({ error: "action must be 'review' or 'unreview'" }, { status: 400 });
  }

  const update =
    body.action === "review"
      ? {
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
          reviewer_note: (body.note ?? "").trim().slice(0, 2000) || null,
        }
      : { reviewed_at: null, reviewed_by: null, reviewer_note: null };

  const { error } = await supabase
    .from("chat_assistant_flags")
    .update(update)
    .eq("id", id);

  if (error) {
    console.error("[admin/chat-flags] update failed", { id, error: error.message });
    return NextResponse.json({ error: "Failed to update flag" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
