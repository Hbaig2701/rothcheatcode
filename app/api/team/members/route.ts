import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTeamAdminContext } from "@/lib/usage";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Determine whose team to show: own team or owner's team (if admin member)
  let teamOwnerId = user.id;
  const adminCtx = await getTeamAdminContext(user.id);
  if (adminCtx) {
    teamOwnerId = adminCtx.teamOwnerId;
  }

  const admin = createAdminClient();
  const { data: members, error } = await admin
    .from("team_members")
    .select("*")
    .eq("team_owner_id", teamOwnerId)
    .neq("status", "removed")
    .order("invited_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(members ?? []);
}
