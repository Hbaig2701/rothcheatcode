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
      .select("client_id, baseline_final_net_worth, blueprint_final_net_worth, gi_tax_free_wealth_created")
      .order("created_at", { ascending: false }),
  ]);

  if (clientsResult.error) {
    console.error("Error fetching clients:", clientsResult.error);
    return NextResponse.json({ error: clientsResult.error.message }, { status: 500 });
  }

  const clients = clientsResult.data ?? [];

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
        if (client && isGuaranteedIncomeProduct(client.blueprint_type) && p.gi_tax_free_wealth_created != null) {
          deltaMap.set(p.client_id, Math.round(
            (p.gi_tax_free_wealth_created / p.baseline_final_net_worth) * 100
          ));
        } else {
          deltaMap.set(p.client_id, Math.round(
            ((p.blueprint_final_net_worth - p.baseline_final_net_worth) / p.baseline_final_net_worth) * 100
          ));
        }
      }
    }
  }

  // Attach delta to each client
  const clientsWithDelta = clients.map(c => ({
    ...c,
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
