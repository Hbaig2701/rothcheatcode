import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { clientFullSchema } from "@/lib/validations/client";
import { checkClientLimit } from "@/lib/usage";
import { isGuaranteedIncomeProduct } from "@/lib/config/products";

// GET /api/clients - List all clients for the authenticated user
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  // CRITICAL: Use getUser() NOT getSession() for secure server-side auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch clients and latest projections in parallel
  const [clientsResult, projectionsResult] = await Promise.all([
    supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("projections")
      .select("client_id, baseline_final_net_worth, blueprint_final_net_worth, gi_tax_free_wealth_created, baseline_final_traditional, blueprint_final_traditional, baseline_years")
      .order("created_at", { ascending: false }),
  ]);

  if (clientsResult.error) {
    console.error("Error fetching clients:", clientsResult.error);
    return NextResponse.json({ error: clientsResult.error.message }, { status: 500 });
  }

  let clients = clientsResult.data ?? [];

  // Group by name to only show ONE client card per name (treating duplicates as scenarios)
  // We keep the initially created client as the primary access point for that client group
  if (clients.length > 0) {
    // Sort oldest first so the original client is processed first
    const oldestFirst = [...clients].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const uniqueMap = new Map();
    for (const c of oldestFirst) {
      if (!uniqueMap.has(c.name)) {
        uniqueMap.set(c.name, c);
      }
    }
    // Re-sort back to newest-first based on original creation date
    clients = Array.from(uniqueMap.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  // Build per-client delta map from latest projection
  const deltaMap = new Map<string, number>();
  if (projectionsResult.data) {
    const seen = new Set<string>();
    for (const p of projectionsResult.data) {
      if (seen.has(p.client_id)) continue;
      seen.add(p.client_id);

      if (p.baseline_final_net_worth > 0) {
        // Find the client to check product type
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

// Helper to filter out legacy federal_bracket values (e.g., "auto", "22", "24")
const extractScenarioName = (val: any) => {
  if (!val || typeof val !== "string") return null;
  if (val === "auto") return null;
  if (!isNaN(Number(val)) && Number(val) <= 100) return null;
  return val;
};
  const clientsWithDelta = clients.map(c => ({
    ...c,
    scenario_name: extractScenarioName(c.federal_bracket),
    delta: deltaMap.get(c.id) ?? null,
  }));

  return NextResponse.json(clientsWithDelta);
}

// POST /api/clients - Create a new client
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check client limit
  const clientLimit = await checkClientLimit(user.id);
  if (!clientLimit.allowed) {
    return NextResponse.json(
      {
        error: "Client limit reached",
        message: `You've reached your limit of ${clientLimit.limit} clients. Upgrade to Pro for unlimited clients.`,
        current: clientLimit.current,
        limit: clientLimit.limit,
        showUpgrade: true,
      },
      { status: 403 }
    );
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

  // Map scenario_name to federal_bracket (DB column is NOT NULL, default to "auto")
  const { scenario_name, ...clientData } = parsed.data;

  // Insert client with user_id from authenticated user
  const { data, error } = await supabase
    .from("clients")
    .insert({ ...clientData, federal_bracket: scenario_name || clientData.federal_bracket || "auto", user_id: user.id })
    .select()
    .single();

  if (error) {
    console.error("Error creating client:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
