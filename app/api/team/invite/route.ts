import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email, role } = await request.json();

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  // Verify Pro plan
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();

  if (profile?.plan !== "pro") {
    return NextResponse.json(
      { error: "Pro plan required for team members" },
      { status: 403 }
    );
  }

  // Check team size
  const { count } = await supabase
    .from("team_members")
    .select("*", { count: "exact", head: true })
    .eq("team_owner_id", user.id)
    .neq("status", "removed");

  if ((count ?? 0) >= 3) {
    return NextResponse.json(
      { error: "Team limit reached (3 members)" },
      { status: 400 }
    );
  }

  // Create invite
  const admin = createAdminClient();
  const { data: invite, error } = await admin
    .from("team_members")
    .insert({
      team_owner_id: user.id,
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
    // Don't fail — the invite record is created, owner can share link manually
  }

  return NextResponse.json({
    success: true,
    invite,
    inviteUrl: `${process.env.NEXT_PUBLIC_APP_URL}/invite/${invite.id}`,
  });
}
