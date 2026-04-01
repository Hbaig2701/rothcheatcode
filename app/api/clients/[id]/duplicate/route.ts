import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

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

  // Fetch the original client
  const { data: originalClient, error: fetchError } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !originalClient) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // Ensure user owns this client
  if (originalClient.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  const newClientData = {
    ...duplicateData,
    user_id: user.id,
    federal_bracket: `${oldScenarioName} (Copy)`,
    non_ssi_income: clonedNonSsiIncome
  };

  // Insert duplicate
  const { data: newClient, error: insertError } = await supabase
    .from("clients")
    .insert(newClientData)
    .select()
    .single();

  if (insertError) {
    console.error("Error duplicating scenario:", insertError);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Duplicate the latest projection for this scenario so the delta properly populates!
  const { data: latestProjection } = await supabase
    .from("projections")
    .select("*")
    .eq("client_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (latestProjection) {
    const { id: _projId, client_id: _oldClientId, created_at: _projCreated, updated_at: _projUpdated, ...projData } = latestProjection;
    await supabase.from("projections").insert({
      ...projData,
      client_id: newClient.id,
      user_id: user.id
    });
  }

  const mappedClient = { ...newClient, scenario_name: extractScenarioName(newClient.federal_bracket) };
  return NextResponse.json(mappedClient, { status: 201 });
}
