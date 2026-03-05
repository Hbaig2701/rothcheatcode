import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const { inviteId, email, password } = await request.json();

  if (!inviteId || !password) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Verify invite exists and is pending
  const { data: invite, error: inviteError } = await admin
    .from("team_members")
    .select("*")
    .eq("id", inviteId)
    .eq("status", "pending")
    .single();

  if (inviteError || !invite) {
    return NextResponse.json(
      { error: "Invalid or expired invite" },
      { status: 404 }
    );
  }

  try {
    // Check if user already exists
    const { data: existingUsers } = await admin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email === invite.email
    );

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
    } else {
      // Create new user
      const { data: newUser, error: createError } =
        await admin.auth.admin.createUser({
          email: invite.email,
          password,
          email_confirm: true,
        });

      if (createError) throw createError;
      userId = newUser.user.id;
    }

    // Update invite to accepted
    await admin
      .from("team_members")
      .update({
        member_user_id: userId,
        status: "active",
        accepted_at: new Date().toISOString(),
      })
      .eq("id", inviteId);

    // Set team_owner_id on member's profile
    await admin
      .from("profiles")
      .update({
        team_owner_id: invite.team_owner_id,
        plan: "pro", // Inherit owner's plan
        subscription_status: "active",
      })
      .eq("id", userId);

    return NextResponse.json({ success: true, email: invite.email });
  } catch (error) {
    console.error("Accept invite error:", error);
    return NextResponse.json(
      { error: "Failed to accept invite" },
      { status: 500 }
    );
  }
}
