import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { memberId } = await request.json();

  if (!memberId) {
    return NextResponse.json(
      { error: "Member ID required" },
      { status: 400 }
    );
  }

  // Verify ownership
  const { data: member } = await supabase
    .from("team_members")
    .select("id, member_user_id, team_owner_id")
    .eq("id", memberId)
    .eq("team_owner_id", user.id)
    .single();

  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const admin = createAdminClient();

  // Update status to removed
  await admin
    .from("team_members")
    .update({ status: "removed" })
    .eq("id", memberId);

  // Clear team_owner_id on member's profile
  if (member.member_user_id) {
    await admin
      .from("profiles")
      .update({ team_owner_id: null })
      .eq("id", member.member_user_id);
  }

  return NextResponse.json({ success: true });
}
