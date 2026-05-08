import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { clientFullPartialSchema } from "@/lib/validations/client";
import { getVisibleUserIds } from "@/lib/auth/visibleUserIds";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/clients/[id] - Get a single client
export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Scope to (viewer, team_owner). Admins do NOT get broader read here —
  // the support-centre admin RLS is a separate path; mixing them was the
  // Sharon Veasie leak.
  const visibleUserIds = await getVisibleUserIds(supabase, user.id);
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .in("user_id", visibleUserIds)
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
    console.error("Client update validation errors:", JSON.stringify(parsed.error.flatten(), null, 2));
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { scenario_name, ...clientData } = parsed.data;

  // Build the update payload from ONLY the keys that were present in the
  // raw request body. Zod's `.partial()` keeps `.default(...)` calls intact
  // (verified empirically with zod 4) — so calling `safeParse({})` returns
  // every default-bearing field populated with its default. Spreading
  // `clientData` directly into the payload would then issue an UPDATE that
  // overwrites the row with a "blank" client (withdrawals=[], balances=0,
  // age=62, end_age=100, etc.) any time a small partial-update is sent
  // (e.g. the dashboard's "Stay within penalty-free limit" button or the
  // scenario-name inline edit, which post `{respect_penalty_free_limit:true}`
  // or `{scenario_name: "..."}` only). This was the Paul Zuidema data-loss
  // bug surfaced in support ticket 34b54286 — the client's whole row went to
  // defaults the moment one of those tiny PUTs went through.
  const bodyKeys = body && typeof body === "object" ? Object.keys(body) : [];
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  };
  for (const key of bodyKeys) {
    if (key === "scenario_name") continue; // handled below via federal_bracket
    if (key in clientData) {
      updatePayload[key] = (clientData as Record<string, unknown>)[key];
    }
  }

  // When the advisor switches a client to a non-married filing status, force
  // every spouse-derived column to null so the engine + UI can never read a
  // stale value (e.g. spouse age leaking into the year-by-year table after a
  // divorce/widowhood update). The form already hides these fields, but
  // setValue(undefined) strips them from the JSON body — so the DB would
  // otherwise retain the prior values.
  const incomingFilingStatus = (clientData as Record<string, unknown>).filing_status;
  if (typeof incomingFilingStatus === "string"
    && incomingFilingStatus !== "married_filing_jointly"
    && incomingFilingStatus !== "married_filing_separately") {
    updatePayload.spouse_name = null;
    updatePayload.spouse_age = null;
    updatePayload.spouse_dob = null;
    updatePayload.spouse_ssi_payout_age = null;
    updatePayload.spouse_ssi_annual_amount = null;
    updatePayload.ss_spouse = 0; // NOT NULL column — zero it out instead of nulling.
  }

  // Only overwrite federal_bracket if scenario_name was explicitly provided with a value
  if (scenario_name) {
    (updatePayload as any).federal_bracket = scenario_name;
  }
  // Ensure federal_bracket is never null (DB NOT NULL constraint)
  if ((updatePayload as any).federal_bracket == null) {
    delete (updatePayload as any).federal_bracket;
  }

  // Update client and set updated_at timestamp.
  // Same visibility scope as GET: viewer + team_owner only. Admins do NOT
  // edit other advisors' clients via this route (a separate admin tool would
  // be needed if that's ever required).
  const visibleUserIdsForUpdate = await getVisibleUserIds(supabase, user.id);
  const { data, error } = await supabase
    .from("clients")
    .update(updatePayload)
    .eq("id", id)
    .in("user_id", visibleUserIdsForUpdate)
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

  // Same visibility scope as GET/PUT: viewer + team_owner only. Admins do
  // NOT delete other advisors' clients via this route.
  const visibleUserIdsForDelete = await getVisibleUserIds(supabase, user.id);
  const { error } = await supabase
    .from("clients")
    .delete()
    .eq("id", id)
    .in("user_id", visibleUserIdsForDelete);

  if (error) {
    console.error("Error deleting client:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Return 204 No Content on successful deletion
  return new NextResponse(null, { status: 204 });
}
