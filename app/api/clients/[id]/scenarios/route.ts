import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isGuaranteedIncomeProduct } from "@/lib/config/products";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // First, find the original client's name
  const { data: originalClient, error: originalError } = await supabase
    .from("clients")
    .select("name")
    .eq("id", id)
    .single();

  if (originalError || !originalClient) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // Get all scenarios for the exact same customer name (since parent_client_id is not applied)
  const [clientsResult, projectionsResult] = await Promise.all([
    supabase
      .from("clients")
      .select("*")
      .eq("name", originalClient.name)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("projections")
      .select("client_id, baseline_final_net_worth, blueprint_final_net_worth, gi_tax_free_wealth_created, baseline_final_traditional, blueprint_final_traditional, baseline_years")
      .order("created_at", { ascending: false }),
  ]);

  if (clientsResult.error) {
    console.error("Error fetching scenarios:", clientsResult.error);
    return NextResponse.json({ error: clientsResult.error.message }, { status: 500 });
  }

  const clients = clientsResult.data ?? [];

  // Build per-scenario delta map from latest projection
  const deltaMap = new Map<string, number>();
  if (projectionsResult.data) {
    const seen = new Set<string>();
    for (const p of projectionsResult.data) {
      if (seen.has(p.client_id)) continue;
      seen.add(p.client_id);

      if (p.baseline_final_net_worth > 0) {
        const client = clients.find(c => c.id === p.client_id);
        if (client) {
          if (isGuaranteedIncomeProduct(client.blueprint_type) && p.gi_tax_free_wealth_created != null) {
            deltaMap.set(p.client_id, Math.round(
              (p.gi_tax_free_wealth_created / p.baseline_final_net_worth) * 100
            ));
          } else {
            // Robust Growth Calculation matching frontend
            const heirTaxRate = (client.heir_tax_rate ?? 40) / 100;
            const rmdTreatment = client.rmd_treatment ?? 'reinvested';
            
            // Baseline 
            const baseHeirTax = Math.round(p.baseline_final_traditional * heirTaxRate);
            const baseNetLegacy = p.baseline_final_net_worth - baseHeirTax;
            const lastBaselineYear = p.baseline_years ? p.baseline_years[p.baseline_years.length - 1] : null;
            const baseCumulativeDistributions = lastBaselineYear?.cumulativeDistributions ?? 0;
            const baseLifetime = rmdTreatment === 'spent'
              ? baseNetLegacy + baseCumulativeDistributions
              : baseNetLegacy;
              
            // Strategy
            const blueHeirTax = Math.round(p.blueprint_final_traditional * heirTaxRate);
            const blueLifetime = p.blueprint_final_net_worth - blueHeirTax;
            
            const diff = blueLifetime - baseLifetime;
            const pct = baseLifetime !== 0 ? diff / Math.abs(baseLifetime) : 0;
            
            deltaMap.set(p.client_id, Math.round(pct * 100));
          }
        }
      }
    }
  }

  const extractScenarioName = (val: any) => {
    if (!val || typeof val !== "string") return null;
    if (val === "auto") return null;
    if (!isNaN(Number(val)) && Number(val) <= 100) return null;
    return val;
  };

  // Attach delta and map federal_bracket to scenario_name
  const scenariosWithDelta = clients.map(c => ({
    ...c,
    scenario_name: extractScenarioName(c.federal_bracket),
    delta: deltaMap.get(c.id) ?? null,
  }));

  return NextResponse.json(scenariosWithDelta);
}
