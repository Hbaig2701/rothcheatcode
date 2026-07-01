import type { Client } from "@/lib/types/client";
import type {
  DashboardData,
  DashboardMetrics,
  ProjectionSummary,
} from "@/lib/types/dashboard";
import { ALL_PRODUCTS, isGuaranteedIncomeProduct } from "@/lib/config/products";
import type { FormulaType } from "@/lib/config/products";

const PRODUCT_COLORS = [
  "#F5B800", // Primary Yellow
  "#C99700", // Dark Gold
  "#FFD966", // Light Yellow
  "#8B6914", // Bronze
  "#A0A0A0", // Gray
  "#6B6B6B", // Dark Gray
];

function isThisMonth(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

/**
 * Compute all dashboard metrics from raw API data.
 * Pure function - no side effects.
 */
export function computeDashboardMetrics(data: DashboardData): DashboardMetrics {
  const { clients, projections, pipeline, usage } = data;

  // Build projection lookup by client_id
  const projMap = new Map<string, ProjectionSummary>();
  for (const p of projections) {
    projMap.set(p.client_id, p);
  }

  // CRITICAL: every row in the `clients` table is technically a SCENARIO —
  // when the advisor clicks "New Scenario" it duplicates the current row.
  // Multiple scenarios for the same client share the same `name`. Counting
  // raw rows triple-counts a client with 3 scenarios in every aggregate
  // metric: "Total Clients" inflates, AUM triple-sums their IRA balance,
  // avg-wealth-increase weighs that client 3x in the average, etc.
  // (Reported by Daven Sharma, 2026-06-06: had 2 actual clients with 4
  // total scenario rows, dashboard showed "4 clients" and AUM × scenarios.)
  //
  // Build the canonical-client set: group by NAME (within this advisor's
  // scope, which is already enforced upstream by the API), pick the most
  // recently updated row from each group as the representative. We dedup on
  // name only — NOT on (name, age, filing_status) — because advisors edit
  // those fields routinely (a client ages a year, changes filing status
  // after a divorce, etc.) and an edit would split one client into two
  // canonical rows under the stricter key. Hamza's account caught this:
  // "Test Hamza" had 3 scenarios at age 52 plus 1 row where age was edited
  // to 62 — under (name, age, filing_status) that one client became two.
  //
  // Trade-off: two ACTUALLY different clients with the exact same name
  // collapse to one in the count. Accepted — the previous behavior was
  // also wrong for them (counted them as 2N scenarios instead of 2 clients),
  // and the advisor can rename one to disambiguate. A real fix requires
  // splitting clients and scenarios into two tables — out of scope here.
  const canonicalByKey = new Map<string, Client>();
  for (const c of clients) {
    const key = c.name;
    const existing = canonicalByKey.get(key);
    const cTime = new Date(c.updated_at).getTime();
    const eTime = existing ? new Date(existing.updated_at).getTime() : -Infinity;
    if (!existing || cTime > eTime) {
      canonicalByKey.set(key, c);
    }
  }
  const canonicalClients = Array.from(canonicalByKey.values());

  // --- Top Metrics --- (use canonical set so each unique client counts once)
  const totalClients = canonicalClients.length;

  const thisMonthClients = canonicalClients.filter((c) => isThisMonth(c.created_at));
  const newClientsThisMonth = thisMonthClients.length;

  const totalAUM = canonicalClients.reduce((sum, c) => sum + (c.qualified_account_value || 0), 0);
  const aumChangeThisMonth = thisMonthClients.reduce(
    (sum, c) => sum + (c.qualified_account_value || 0),
    0
  );

  // Average wealth increase: % advantage for clients with projections
  // GI products: use gi_tax_free_wealth_created (lifetime income advantage)
  // Growth products: use blueprint - baseline net worth difference
  // Uses canonicalClients so a client with 5 scenarios isn't weighted 5x.
  const wealthChanges: number[] = [];
  for (const c of canonicalClients) {
    const p = projMap.get(c.id);
    if (!p || p.baseline_final_net_worth <= 0) continue;

    let advantage: number;
    if (isGuaranteedIncomeProduct(c.blueprint_type) && p.gi_tax_free_wealth_created != null) {
      // GI: lifetime income advantage as % of baseline
      advantage = (p.gi_tax_free_wealth_created / p.baseline_final_net_worth) * 100;
    } else {
      // Growth: net worth difference as % of baseline
      advantage =
        ((p.blueprint_final_net_worth - p.baseline_final_net_worth) /
          p.baseline_final_net_worth) *
        100;
    }
    wealthChanges.push(advantage);
  }
  const avgWealthIncrease =
    wealthChanges.length > 0
      ? Math.round(wealthChanges.reduce((a, b) => a + b, 0) / wealthChanges.length)
      : 0;

  // --- Value Delivered ---
  // Roll up projection numbers per canonical client (not per scenario row)
  // so a client with 3 scenarios doesn't triple-count their lifetime wealth /
  // tax savings / legacy. The canonical client's projection is the one that
  // matches its id; the other scenario rows' projections are excluded from
  // the headline.
  const canonicalProjections = canonicalClients
    .map((c) => projMap.get(c.id))
    .filter((p): p is ProjectionSummary => p != null);
  const totalLifetimeWealth = canonicalProjections.reduce(
    (sum, p) => sum + p.blueprint_final_net_worth,
    0
  );
  const totalTaxSavings = Math.abs(canonicalProjections.reduce((sum, p) => sum + p.total_tax_savings, 0));
  // "Legacy protected" = the heir income tax avoided by holding the final Roth
  // balance tax-free = Roth × the client's heir rate. Weight by EACH client's
  // heir_tax_rate (fallback 40%) rather than a flat 40% across the book (audit
  // F13). Iterates canonicalClients so we have both the client (heir rate) and
  // its projection; falls back to 40% when heir_tax_rate is absent.
  const totalLegacyProtected = canonicalClients.reduce((sum, c) => {
    const p = projMap.get(c.id);
    if (!p) return sum;
    const heirRate = (c.heir_tax_rate ?? 40) / 100;
    // Tax-free legacy = the heir income tax avoided by holding the estate in a
    // Roth wrapper instead of a Traditional one = (Roth balance) × heir rate.
    // For GUARANTEED-INCOME strategies the Roth is the annuity, whose account
    // value is mapped into blueprint_final_traditional (not _roth) for chart
    // compatibility — so include it here, else GI clients show $0 protected
    // (audit F17). Growth/standard strategies keep their Roth in _roth.
    const rothEquivalent = isGuaranteedIncomeProduct(c.blueprint_type)
      ? p.blueprint_final_roth + p.blueprint_final_traditional
      : p.blueprint_final_roth;
    return sum + Math.round(rothEquivalent * heirRate);
  }, 0);

  // --- Product Mix ---
  // One entry per distinct client (canonical), not per scenario.
  const productCounts = new Map<string, number>();
  for (const c of canonicalClients) {
    const config = ALL_PRODUCTS[c.blueprint_type as FormulaType];
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

  // --- Recent Formulas (first 5, already sorted by created_at DESC) ---
  const recentFormulas = clients.slice(0, 5).map((c) => {
    const p = projMap.get(c.id);
    let percentChange = 0;
    if (p && p.baseline_final_net_worth > 0) {
      if (isGuaranteedIncomeProduct(c.blueprint_type) && p.gi_tax_free_wealth_created != null) {
        percentChange = Math.round(
          (p.gi_tax_free_wealth_created / p.baseline_final_net_worth) * 100
        );
      } else {
        percentChange = Math.round(
          ((p.blueprint_final_net_worth - p.baseline_final_net_worth) /
            p.baseline_final_net_worth) *
            100
        );
      }
    }
    const config = ALL_PRODUCTS[c.blueprint_type as FormulaType];
    return {
      id: c.id,
      clientName: c.name,
      productLabel: config?.label ?? c.blueprint_type,
      percentChange,
      createdAt: c.created_at,
    };
  });

  // --- Client Insights --- (canonical so demographic stats describe distinct
  // PEOPLE, not how many scenarios each has been run)
  const avgClientAge =
    canonicalClients.length > 0
      ? Math.round(canonicalClients.reduce((sum, c) => sum + c.age, 0) / canonicalClients.length)
      : 0;
  const avgDeposit =
    canonicalClients.length > 0
      ? Math.round(
          canonicalClients.reduce((sum, c) => sum + (c.qualified_account_value || 0), 0) /
            canonicalClients.length
        )
      : 0;

  const filingStatusBreakdown = { single: 0, mfj: 0, mfs: 0, hoh: 0 };
  for (const c of canonicalClients) {
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

  // Approaching RMD: age 72-75 (within 3 years of 75). Canonical so a single
  // pre-RMD client doesn't show up multiple times because they have multiple
  // scenarios.
  const approachingRMDClients = canonicalClients
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
    usage,
    totalLifetimeWealth,
    totalTaxSavings,
    totalLegacyProtected,
    productMix,
    recentFormulas,
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
