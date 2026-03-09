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

  const { memberId, role } = await request.json();

  if (!memberId || !role || !["user", "admin"].includes(role)) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
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
    .select("id, member_user_id")
    .eq("id", memberId)
    .eq("team_owner_id", teamOwnerId)
    .single();

  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Admin team members cannot change the owner's role
  if (adminCtx && member.member_user_id === teamOwnerId) {
    return NextResponse.json(
      { error: "You cannot change the account owner's role" },
      { status: 403 }
    );
  }

  const { error } = await admin
    .from("team_members")
    .update({ role })
    .eq("id", memberId)
    .eq("team_owner_id", teamOwnerId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
