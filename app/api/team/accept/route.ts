import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const { inviteId, password, firstName, lastName } = await request.json();

  if (!inviteId || !password) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }
  if (!/[0-9]/.test(password)) {
    return NextResponse.json(
      { error: "Password must contain at least 1 number" },
      { status: 400 }
    );
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return NextResponse.json(
      { error: "Password must contain at least 1 special character" },
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

  // Check invite TTL (30 days)
  const INVITE_TTL_DAYS = 30;
  const invitedAt = new Date(invite.invited_at);
  const expiresAt = new Date(invitedAt.getTime() + INVITE_TTL_DAYS * 86400000);
  if (new Date() > expiresAt) {
    return NextResponse.json(
      { error: "This invite has expired. Please ask the team owner to send a new one." },
      { status: 410 }
    );
  }

  try {
    // Check if user already exists by invite email (direct lookup, not paginated)
    let existingUser: { id: string; email?: string } | null = null;
    try {
      // First check profiles table (faster, no pagination issue)
      const { data: existingProfile } = await admin
        .from("profiles")
        .select("id")
        .ilike("email", invite.email)
        .single();
      if (existingProfile) {
        existingUser = existingProfile;
      } else {
        // Fallback: check auth users by listing with small page
        const { data: users } = await admin.auth.admin.listUsers({ perPage: 50, page: 1 });
        existingUser = users?.users?.find((u) => u.email === invite.email) ?? null;
      }
    } catch {
      // User doesn't exist, that's fine
    }

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;

      // Bug 6 fix: Check if user is deactivated before allowing invite acceptance
      const { data: memberProfile } = await admin
        .from("profiles")
        .select("is_active")
        .eq("id", userId)
        .single();
      if (memberProfile?.is_active === false) {
        return NextResponse.json(
          { error: "This account has been deactivated" },
          { status: 403 }
        );
      }
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
      throw new Error("Failed to update invite status");
    }

    // Ensure profile exists and set team_owner_id
    // Try update first, then insert if profile doesn't exist yet
    const { data: updatedProfile } = await admin
      .from("profiles")
      .update({
        team_owner_id: invite.team_owner_id,
      })
      .eq("id", userId)
      .select("id, team_owner_id")
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
        // Duplicate key = trigger just fired, retry update
        if (insertError.code === "23505") {
          await admin
            .from("profiles")
            .update({ team_owner_id: invite.team_owner_id })
            .eq("id", userId);
        } else {
          console.error("Failed to create profile:", insertError);
          throw new Error("Failed to set up team member profile");
        }
      }
    }

    // Verify team_owner_id was actually set
    const { data: verifiedProfile } = await admin
      .from("profiles")
      .select("team_owner_id")
      .eq("id", userId)
      .single();

    if (!verifiedProfile?.team_owner_id) {
      console.error("team_owner_id verification failed for user:", userId);
      // Last resort: force it
      await admin
        .from("profiles")
        .update({ team_owner_id: invite.team_owner_id })
        .eq("id", userId);
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
