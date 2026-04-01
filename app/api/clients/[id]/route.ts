import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { clientFullPartialSchema } from "@/lib/validations/client";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/clients/[id] - Get a single client
export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    // PGRST116 = "The result contains 0 rows" (not found or RLS blocked)
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    console.error("Error fetching client:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const extractScenarioName = (val: any) => {
    if (!val || typeof val !== "string") return null;
    if (val === "auto") return null;
    if (!isNaN(Number(val)) && Number(val) <= 100) return null;
    return val;
  };

  const mappedClient = { ...data, scenario_name: extractScenarioName(data.federal_bracket) };
  return NextResponse.json(mappedClient);
}

// PUT /api/clients/[id] - Update a client
export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
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

  // Validate with partial schema (all fields optional for updates)
  const parsed = clientFullPartialSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { scenario_name, ...clientData } = parsed.data;
  
  // Create update payload handling scenario_name to federal_bracket
  const updatePayload = {
    ...clientData,
    updated_at: new Date().toISOString()
  };
  
  if (scenario_name !== undefined) {
    (updatePayload as any).federal_bracket = scenario_name || null;
  }

  // Update client and set updated_at timestamp
  const { data, error } = await supabase
    .from("clients")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    console.error("Error updating client:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const extractScenarioName = (val: any) => {
    if (!val || typeof val !== "string") return null;
    if (val === "auto") return null;
    if (!isNaN(Number(val)) && Number(val) <= 100) return null;
    return val;
  };

  const mappedClient = { ...data, scenario_name: extractScenarioName(data.federal_bracket) };
  return NextResponse.json(mappedClient);
}

// DELETE /api/clients/[id] - Delete a client
export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("clients")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting client:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Return 204 No Content on successful deletion
  return new NextResponse(null, { status: 204 });
}
