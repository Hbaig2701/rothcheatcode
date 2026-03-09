import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTeamAdminContext } from "@/lib/usage";

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

  // Determine the team owner: either this user or their team owner (if admin)
  let teamOwnerId = user.id;
  const adminCtx = await getTeamAdminContext(user.id);
  if (adminCtx) {
    teamOwnerId = adminCtx.teamOwnerId;
  }

  const admin = createAdminClient();

  // Verify this member belongs to the team
  const { data: member } = await admin
    .from("team_members")
    .select("id, member_user_id, team_owner_id")
    .eq("id", memberId)
    .eq("team_owner_id", teamOwnerId)
    .single();

  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Admin team members cannot remove the owner (owner isn't in team_members,
  // but guard against any edge case where member_user_id === teamOwnerId)
  if (adminCtx && member.member_user_id === teamOwnerId) {
    return NextResponse.json(
      { error: "You cannot remove the account owner" },
      { status: 403 }
    );
  }

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
