import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/settings - Fetch current user's settings
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch existing settings (RLS filters by user_id)
  let { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .single();

  // If no row exists, create one
  if (error?.code === "PGRST116") {
    const { data: inserted, error: insertError } = await supabase
      .from("user_settings")
      .insert({ user_id: user.id })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating settings:", insertError);
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }
    data = inserted;
    error = null;
  }

  if (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// PUT /api/settings - Update user settings (profile, business, defaults)
export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Remove fields that shouldn't be updated directly
  const { id, user_id, created_at, updated_at, ...updates } = body;

  const { data, error } = await supabase
    .from("user_settings")
    .update(updates)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    console.error("Error updating settings:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
