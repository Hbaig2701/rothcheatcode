import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const admin = createAdminClient();

  const { data: invite, error } = await admin
    .from("team_members")
    .select("id, email, role, status, team_owner_id")
    .eq("id", id)
    .eq("status", "pending")
    .single();

  if (error || !invite) {
    return NextResponse.json(
      { error: "Invalid or expired invite" },
      { status: 404 }
    );
  }

  // Get team owner info
  const { data: owner } = await admin
    .from("profiles")
    .select("email")
    .eq("id", invite.team_owner_id)
    .single();

  const { data: ownerSettings } = await admin
    .from("user_settings")
    .select("company_name")
    .eq("user_id", invite.team_owner_id)
    .single();

  return NextResponse.json({
    invite: {
      id: invite.id,
      email: invite.email,
      role: invite.role,
    },
    teamOwner: {
      email: owner?.email,
      companyName: ownerSettings?.company_name,
    },
  });
}
