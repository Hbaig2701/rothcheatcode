import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanLimits, type PlanId } from "@/lib/config/plans";
import { getTeamAdminContext } from "@/lib/usage";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email, role } = await request.json();

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return NextResponse.json(
      { error: "Invalid email format" },
      { status: 400 }
    );
  }

  // Prevent self-invite
  if (email.toLowerCase() === user.email?.toLowerCase()) {
    return NextResponse.json(
      { error: "You cannot invite yourself" },
      { status: 400 }
    );
  }

  // Validate role
  const validRoles = ["user", "admin"];
  if (role && !validRoles.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Determine the team owner: either this user or their team owner (if admin)
  let teamOwnerId = user.id;
  const adminCtx = await getTeamAdminContext(user.id);
  if (adminCtx) {
    teamOwnerId = adminCtx.teamOwnerId;
  }

  const admin = createAdminClient();

  // Get owner's profile for plan check and to prevent inviting the owner
  const { data: ownerProfile } = await admin
    .from("profiles")
    .select("plan, email")
    .eq("id", teamOwnerId)
    .single();

  // Prevent inviting the team owner
  if (email.toLowerCase() === ownerProfile?.email?.toLowerCase()) {
    return NextResponse.json(
      { error: "You cannot invite the account owner" },
      { status: 400 }
    );
  }

  const planLimits = getPlanLimits((ownerProfile?.plan as PlanId) ?? "none");
  if (planLimits.teamMembers === 0) {
    return NextResponse.json(
      { error: "The current plan does not include team members." },
      { status: 403 }
    );
  }

  // Check current team member count against limit
  if (planLimits.teamMembers !== Infinity) {
    const { count: currentCount } = await admin
      .from("team_members")
      .select("*", { count: "exact", head: true })
      .eq("team_owner_id", teamOwnerId)
      .neq("status", "removed");

    if ((currentCount ?? 0) >= planLimits.teamMembers) {
      return NextResponse.json(
        { error: `Maximum number of team members (${planLimits.teamMembers}) reached for this plan.` },
        { status: 403 }
      );
    }
  }

  const { data: invite, error } = await admin
    .from("team_members")
    .insert({
      team_owner_id: teamOwnerId,
      email: email.toLowerCase(),
      role: role || "user",
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "This email has already been invited" },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Send invite email via Supabase magic link
  const { error: emailError } = await admin.auth.admin.inviteUserByEmail(
    email.toLowerCase(),
    {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/invite/${invite.id}`,
    }
  );

  if (emailError) {
    console.error("Invite email error:", emailError);
  }

  return NextResponse.json({
    success: true,
    invite,
    inviteUrl: `${process.env.NEXT_PUBLIC_APP_URL}/invite/${invite.id}`,
    ...(emailError && {
      warning:
        "Email could not be sent. Please share the invite link manually.",
    }),
  });
}
