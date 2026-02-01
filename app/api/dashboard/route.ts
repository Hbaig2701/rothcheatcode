import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { ALL_PRODUCTS } from "@/lib/config/products";
import type { Client } from "@/lib/types/client";
import type { ProjectionSummary, ConversionPipelineItem } from "@/lib/types/dashboard";
import type { YearlyResult } from "@/lib/calculations/types";

interface ProjectionRow {
  client_id: string;
  baseline_final_net_worth: number;
  blueprint_final_net_worth: number;
  blueprint_final_roth: number;
  total_tax_savings: number;
  heir_benefit: number;
  blueprint_years: YearlyResult[] | null;
  created_at: string;
}

/**
 * GET /api/dashboard - Fetch all dashboard data in 2 queries
 * Returns clients, slim projections, and pre-computed pipeline data
 */
export async function GET() {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch clients and projections in parallel
  const [clientsResult, projectionsResult] = await Promise.all([
    supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("projections")
      .select("client_id, baseline_final_net_worth, blueprint_final_net_worth, blueprint_final_roth, total_tax_savings, heir_benefit, blueprint_years, created_at")
      .order("created_at", { ascending: false }),
  ]);

  if (clientsResult.error) {
    console.error("Error fetching clients:", clientsResult.error);
    return NextResponse.json({ error: clientsResult.error.message }, { status: 500 });
  }

  if (projectionsResult.error) {
    console.error("Error fetching projections:", projectionsResult.error);
    return NextResponse.json({ error: projectionsResult.error.message }, { status: 500 });
  }

  const clients: Client[] = clientsResult.data ?? [];
  const rawProjections: ProjectionRow[] = projectionsResult.data ?? [];

  // Deduplicate projections: keep latest per client_id
  const projectionMap = new Map<string, ProjectionRow>();
  for (const p of rawProjections) {
    if (!projectionMap.has(p.client_id)) {
      projectionMap.set(p.client_id, p);
    }
  }

  // Build client lookup for pipeline
  const clientMap = new Map<string, Client>();
  for (const c of clients) {
    clientMap.set(c.id, c);
  }

  // Compute conversion pipeline from blueprint_years
  const pipeline: ConversionPipelineItem[] = [];
  const currentCalendarYear = new Date().getFullYear();

  for (const [clientId, proj] of projectionMap) {
    const client = clientMap.get(clientId);
    if (!client || !proj.blueprint_years || !Array.isArray(proj.blueprint_years)) continue;

    const years = proj.blueprint_years as YearlyResult[];
    const conversionYears = years.filter(y => y.conversionAmount > 0);
    if (conversionYears.length === 0) continue;

    const firstConversionYear = conversionYears[0].year;
    const lastConversionYear = conversionYears[conversionYears.length - 1].year;
    const totalYears = lastConversionYear - firstConversionYear + 1;

    // Determine how many years have elapsed
    const yearsElapsed = Math.max(0, currentCalendarYear - firstConversionYear + 1);
    const currentYear = Math.min(yearsElapsed, totalYears);
    const isComplete = yearsElapsed >= totalYears;

    // Get remaining IRA balance at current year (or last conversion year if complete)
    const targetYear = isComplete ? lastConversionYear : currentCalendarYear;
    const targetYearData = years.find(y => y.year === targetYear);
    const remainingAmount = targetYearData?.traditionalBalance ?? 0;

    const productConfig = ALL_PRODUCTS[client.blueprint_type as keyof typeof ALL_PRODUCTS];

    pipeline.push({
      clientId,
      clientName: client.name,
      productLabel: productConfig?.label ?? client.blueprint_type,
      currentYear,
      totalYears,
      remainingAmount,
      percentComplete: totalYears > 0 ? Math.round((currentYear / totalYears) * 100) : 100,
      isComplete,
    });
  }

  // Strip blueprint_years from projections before sending to client
  const projections: ProjectionSummary[] = Array.from(projectionMap.values()).map(p => ({
    client_id: p.client_id,
    baseline_final_net_worth: p.baseline_final_net_worth,
    blueprint_final_net_worth: p.blueprint_final_net_worth,
    blueprint_final_roth: p.blueprint_final_roth,
    total_tax_savings: p.total_tax_savings,
    heir_benefit: p.heir_benefit,
  }));

  return NextResponse.json({ clients, projections, pipeline });
}
