import type { Client } from "@/lib/types/client";
import type {
  DashboardData,
  DashboardMetrics,
  ProjectionSummary,
} from "@/lib/types/dashboard";
import { ALL_PRODUCTS } from "@/lib/config/products";
import type { CheatCodeType } from "@/lib/config/products";

const PRODUCT_COLORS = [
  "#F5B800", // gold (primary brand)
  "#3b82f6", // blue
  "#8b5cf6", // purple
  "#22c55e", // green
  "#ef4444", // red
  "#f59e0b", // amber
  "#6366f1", // indigo
];

function isThisMonth(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function isLastMonth(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
}

/**
 * Compute all dashboard metrics from raw API data.
 * Pure function - no side effects.
 */
export function computeDashboardMetrics(data: DashboardData): DashboardMetrics {
  const { clients, projections, pipeline } = data;

  // Build projection lookup by client_id
  const projMap = new Map<string, ProjectionSummary>();
  for (const p of projections) {
    projMap.set(p.client_id, p);
  }

  // --- Top Metrics ---
  const totalClients = clients.length;

  const thisMonthClients = clients.filter((c) => isThisMonth(c.created_at));
  const lastMonthClients = clients.filter((c) => isLastMonth(c.created_at));
  const newClientsThisMonth = thisMonthClients.length;
  const cheatCodesThisMonth = thisMonthClients.length;

  const cheatCodesLastMonth = lastMonthClients.length;
  const cheatCodesChangePercent =
    cheatCodesLastMonth > 0
      ? Math.round(((cheatCodesThisMonth - cheatCodesLastMonth) / cheatCodesLastMonth) * 100)
      : cheatCodesThisMonth > 0
        ? 100
        : 0;

  const totalAUM = clients.reduce((sum, c) => sum + (c.qualified_account_value || 0), 0);
  const aumChangeThisMonth = thisMonthClients.reduce(
    (sum, c) => sum + (c.qualified_account_value || 0),
    0
  );

  // Average wealth increase: % change for clients with projections
  const wealthChanges: number[] = [];
  for (const c of clients) {
    const p = projMap.get(c.id);
    if (p && p.baseline_final_net_worth > 0) {
      const pctChange =
        ((p.blueprint_final_net_worth - p.baseline_final_net_worth) /
          p.baseline_final_net_worth) *
        100;
      wealthChanges.push(pctChange);
    }
  }
  const avgWealthIncrease =
    wealthChanges.length > 0
      ? Math.round(wealthChanges.reduce((a, b) => a + b, 0) / wealthChanges.length)
      : 0;

  // --- Value Delivered ---
  const totalLifetimeWealth = projections.reduce(
    (sum, p) => sum + p.blueprint_final_net_worth,
    0
  );
  const totalTaxSavings = Math.abs(projections.reduce((sum, p) => sum + p.total_tax_savings, 0));
  const totalLegacyProtected = projections.reduce(
    (sum, p) => sum + Math.round(p.blueprint_final_roth * 0.4),
    0
  );

  // --- Product Mix ---
  const productCounts = new Map<string, number>();
  for (const c of clients) {
    const config = ALL_PRODUCTS[c.blueprint_type as CheatCodeType];
    const label = config?.label ?? c.blueprint_type;
    productCounts.set(label, (productCounts.get(label) ?? 0) + 1);
  }
  const productMix = Array.from(productCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, value], i) => ({
      name,
      value,
      color: PRODUCT_COLORS[i % PRODUCT_COLORS.length],
    }));

  // --- Recent CheatCodes (first 5, already sorted by created_at DESC) ---
  const recentCheatCodes = clients.slice(0, 5).map((c) => {
    const p = projMap.get(c.id);
    const percentChange =
      p && p.baseline_final_net_worth > 0
        ? Math.round(
            ((p.blueprint_final_net_worth - p.baseline_final_net_worth) /
              p.baseline_final_net_worth) *
              100
          )
        : 0;
    const config = ALL_PRODUCTS[c.blueprint_type as CheatCodeType];
    return {
      id: c.id,
      clientName: c.name,
      productLabel: config?.label ?? c.blueprint_type,
      percentChange,
      createdAt: c.created_at,
    };
  });

  // --- Client Insights ---
  const avgClientAge =
    clients.length > 0
      ? Math.round(clients.reduce((sum, c) => sum + c.age, 0) / clients.length)
      : 0;
  const avgDeposit =
    clients.length > 0
      ? Math.round(
          clients.reduce((sum, c) => sum + (c.qualified_account_value || 0), 0) /
            clients.length
        )
      : 0;

  const filingStatusBreakdown = { single: 0, mfj: 0, mfs: 0, hoh: 0 };
  for (const c of clients) {
    switch (c.filing_status) {
      case "single":
        filingStatusBreakdown.single++;
        break;
      case "married_filing_jointly":
        filingStatusBreakdown.mfj++;
        break;
      case "married_filing_separately":
        filingStatusBreakdown.mfs++;
        break;
      case "head_of_household":
        filingStatusBreakdown.hoh++;
        break;
    }
  }

  // Approaching RMD: age 72-75 (within 3 years of 75)
  const approachingRMDClients = clients
    .filter((c) => {
      const yearsToRMD = 75 - c.age;
      return yearsToRMD > 0 && yearsToRMD <= 3;
    })
    .map((c) => ({ id: c.id, name: c.name, age: c.age }));

  // --- Pipeline ---
  const activePipeline = pipeline.filter((p) => !p.isComplete);
  const activePipelineCount = activePipeline.length;
  const totalPipelineValue = activePipeline.reduce((sum, p) => sum + p.remainingAmount, 0);

  return {
    totalClients,
    newClientsThisMonth,
    totalAUM,
    aumChangeThisMonth,
    avgWealthIncrease,
    cheatCodesThisMonth,
    cheatCodesChangePercent,
    totalLifetimeWealth,
    totalTaxSavings,
    totalLegacyProtected,
    productMix,
    recentCheatCodes,
    avgClientAge,
    avgDeposit,
    filingStatusBreakdown,
    approachingRMDCount: approachingRMDClients.length,
    approachingRMDClients,
    pipeline,
    activePipelineCount,
    totalPipelineValue,
  };
}
