import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { getVisibleUserIds } from "@/lib/auth/visibleUserIds";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Allow the owner OR a team member of the owner. RLS already grants team
  // members SELECT/UPDATE/DELETE on the owner's clients, so blocking just the
  // duplicate route was inconsistent — they could view and edit but not clone.
  const visibleUserIds = await getVisibleUserIds(supabase, user.id);

  // Fetch the original client (scoped to ownership + team_owner)
  const { data: originalClient, error: fetchError } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .in("user_id", visibleUserIds)
    .single();

  if (fetchError || !originalClient) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const { id: _, user_id: __, created_at: ___, updated_at: ____, ...duplicateData } = originalClient;
  
  // Clone non_ssi_income correctly if it's an object/array
  const clonedNonSsiIncome = originalClient.non_ssi_income 
    ? JSON.parse(JSON.stringify(originalClient.non_ssi_income)) 
    : [];

  const extractScenarioName = (val: any) => {
    if (!val || typeof val !== "string") return null;
    if (val === "auto") return null;
    if (!isNaN(Number(val)) && Number(val) <= 100) return null;
    return val;
  };

  const oldScenarioName = extractScenarioName(originalClient.federal_bracket) || originalClient.product_name;

  // The clone's owner is whoever the original belonged to. That keeps the
  // clone visible to the same team (owner + team_members) instead of being
  // privately attributed to the cloner — otherwise a team member's "Plus
  // copy" of Tom Martin would silently disappear from the owner's view.
  // We use the admin client for the actual insert because RLS's INSERT
  // policy is `user_id = auth.uid()` and a team member can't insert a row
  // attributed to the owner without it. We've already authorized the action
  // above by scoping the SELECT to visibleUserIds — admin client is safe.
  const admin = createAdminClient();
  const newClientData = {
    ...duplicateData,
    user_id: originalClient.user_id,
    federal_bracket: `${oldScenarioName} (Copy)`,
    non_ssi_income: clonedNonSsiIncome
  };

  // Insert duplicate (admin-bypass RLS — see above)
  const { data: newClient, error: insertError } = await admin
    .from("clients")
    .insert(newClientData)
    .select()
    .single();

  if (insertError) {
    console.error("Error duplicating scenario:", insertError);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Duplicate the latest projection. SELECT can use the user-scoped client
  // because projections RLS is now team-aware (20260507040000). INSERT uses
  // admin client so the row can be attributed to the owner under a team
  // member's session.
  const { data: latestProjection } = await supabase
    .from("projections")
    .select("*")
    .eq("client_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (latestProjection) {
    const { id: _projId, client_id: _oldClientId, created_at: _projCreated, updated_at: _projUpdated, ...projData } = latestProjection;
    await admin.from("projections").insert({
      ...projData,
      client_id: newClient.id,
      user_id: originalClient.user_id
    });
  }

  const mappedClient = { ...newClient, scenario_name: extractScenarioName(newClient.federal_bracket) };
  return NextResponse.json(mappedClient, { status: 201 });
}
