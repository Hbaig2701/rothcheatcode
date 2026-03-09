import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const { inviteId, email, password, firstName, lastName } =
    await request.json();

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
    // Check if user already exists (targeted lookup, not listUsers)
    const { data: existingUsers } = await admin.auth.admin.listUsers({
      filter: invite.email,
      perPage: 1,
      page: 1,
    });
    const existingUser = existingUsers?.users?.[0];

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
      // Update password for existing user (may have been created by inviteUserByEmail)
      await admin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      });
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
    const { error: updateInviteError } = await admin
      .from("team_members")
      .update({
        member_user_id: userId,
        status: "active",
        accepted_at: new Date().toISOString(),
      })
      .eq("id", inviteId);

    if (updateInviteError) {
      console.error("Failed to update invite:", updateInviteError);
    }

    // Ensure profile exists and set team_owner_id
    // Try update first, then insert if profile doesn't exist yet
    const { data: updatedProfile } = await admin
      .from("profiles")
      .update({
        team_owner_id: invite.team_owner_id,
      })
      .eq("id", userId)
      .select("id")
      .single();

    if (!updatedProfile) {
      // Profile doesn't exist yet (trigger may not have fired), create it
      const { error: insertError } = await admin.from("profiles").insert({
        id: userId,
        email: invite.email,
        team_owner_id: invite.team_owner_id,
        role: "advisor",
        is_active: true,
      });

      if (insertError) {
        console.error("Failed to create profile:", insertError);
        // One more attempt — profile trigger may have just fired
        await admin
          .from("profiles")
          .update({ team_owner_id: invite.team_owner_id })
          .eq("id", userId);
      }
    }

    // Save first/last name to user_settings if provided
    if (firstName || lastName) {
      const { data: existingSettings } = await admin
        .from("user_settings")
        .select("id")
        .eq("user_id", userId)
        .single();

      if (existingSettings) {
        await admin
          .from("user_settings")
          .update({
            first_name: firstName || null,
            last_name: lastName || null,
          })
          .eq("user_id", userId);
      } else {
        await admin.from("user_settings").insert({
          user_id: userId,
          first_name: firstName || null,
          last_name: lastName || null,
        });
      }
    }

    return NextResponse.json({ success: true, email: invite.email });
  } catch (error) {
    console.error("Accept invite error:", error);
    return NextResponse.json(
      { error: "Failed to accept invite" },
      { status: 500 }
    );
  }
}
