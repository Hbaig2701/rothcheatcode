import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const INVITE_TTL_DAYS = 30;

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const visibleChars = Math.min(2, local.length);
  return local.slice(0, visibleChars) + "***@" + domain;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const admin = createAdminClient();

  const { data: invite, error } = await admin
    .from("team_members")
    .select("id, email, role, status, team_owner_id, invited_at")
    .eq("id", id)
    .eq("status", "pending")
    .single();

  if (error || !invite) {
    return NextResponse.json(
      { error: "Invalid or expired invite" },
      { status: 404 }
    );
  }

  // Check invite TTL
  const invitedAt = new Date(invite.invited_at);
  const expiresAt = new Date(invitedAt.getTime() + INVITE_TTL_DAYS * 86400000);
  if (new Date() > expiresAt) {
    return NextResponse.json(
      { error: "This invite has expired. Please ask the team owner to send a new one." },
      { status: 410 }
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
      email: maskEmail(owner?.email || ""),
      companyName: ownerSettings?.company_name,
    },
  });
}
