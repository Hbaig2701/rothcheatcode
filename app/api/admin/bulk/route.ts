import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (adminProfile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { action, advisorIds } = await request.json();

    if (!action || !["delete", "deactivate"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    if (!Array.isArray(advisorIds) || advisorIds.length === 0) {
      return NextResponse.json(
        { error: "No advisors selected" },
        { status: 400 }
      );
    }

    if (advisorIds.length > 50) {
      return NextResponse.json(
        { error: "Maximum 50 advisors per request" },
        { status: 400 }
      );
    }

    // Prevent admin from deleting themselves
    if (advisorIds.includes(user.id)) {
      return NextResponse.json(
        { error: "Cannot include your own account" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const completed: string[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const advisorId of advisorIds) {
      try {
        if (action === "deactivate") {
          const { error } = await admin
            .from("profiles")
            .update({
              is_active: false,
              deactivated_at: new Date().toISOString(),
            })
            .eq("id", advisorId);
          if (error) throw error;
        } else if (action === "delete") {
          // Delete all user data in order (respecting foreign keys)
          await admin.from("projections").delete().eq("user_id", advisorId);
          await admin.from("export_log").delete().eq("user_id", advisorId);
          await admin.from("calculation_log").delete().eq("user_id", advisorId);
          await admin.from("login_log").delete().eq("user_id", advisorId);
          await admin.from("usage").delete().eq("user_id", advisorId);
          await admin.from("team_members").delete().eq("team_owner_id", advisorId);
          await admin.from("clients").delete().eq("user_id", advisorId);
          await admin.from("user_settings").delete().eq("user_id", advisorId);
          await admin.from("profiles").delete().eq("id", advisorId);
          const { error } = await admin.auth.admin.deleteUser(advisorId);
          if (error) throw error;
        }
        completed.push(advisorId);
      } catch (err) {
        failed.push({
          id: advisorId,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      success: true,
      completed: completed.length,
      failed,
    });
  } catch (error) {
    console.error("Bulk action error:", error);
    return NextResponse.json({ error: "Bulk action failed" }, { status: 500 });
  }
}
