import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { clientFullSchema } from "@/lib/validations/client";

// GET /api/clients - List all clients for the authenticated user
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  // CRITICAL: Use getUser() NOT getSession() for secure server-side auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // RLS automatically filters to user's clients via user_id policy
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching clients:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/clients - Create a new client
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate request body with Zod
  const parsed = clientFullSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Insert client with user_id from authenticated user
  const { data, error } = await supabase
    .from("clients")
    .insert({ ...parsed.data, user_id: user.id })
    .select()
    .single();

  if (error) {
    console.error("Error creating client:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
