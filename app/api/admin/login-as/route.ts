import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify admin role
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (adminProfile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    // Use admin client to get the target user's email
    const admin = createAdminClient();
    const { data: targetProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .single();

    if (!targetProfile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Generate a one-time login token by signing in as the user
    // Note: This requires admin privileges and should be used carefully
    const { data: { user: targetUser }, error: signInError } = await admin.auth.admin.getUserById(userId);

    if (signInError || !targetUser) {
      return NextResponse.json({ error: "Failed to login as user" }, { status: 500 });
    }

    // Generate an admin auth token for the target user
    const { data, error: tokenError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: targetUser.email!,
    });

    if (tokenError || !data) {
      return NextResponse.json({ error: "Failed to generate login link" }, { status: 500 });
    }

    // Log the admin action
    await admin.from("admin_actions").insert({
      admin_id: user.id,
      action: "login_as_user",
      target_user_id: userId,
      metadata: { email: targetUser.email },
    });

    // Return the magic link that can be used to sign in as the user
    return NextResponse.json({
      success: true,
      loginUrl: data.properties.action_link,
    });
  } catch (error) {
    console.error("Login-as error:", error);
    return NextResponse.json(
      { error: "Failed to login as user" },
      { status: 500 }
    );
  }
}
