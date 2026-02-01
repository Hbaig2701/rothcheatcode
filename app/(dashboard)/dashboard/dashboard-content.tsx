"use client";

import { useMemo } from "react";
import { useDashboard } from "@/lib/queries/dashboard";
import { computeDashboardMetrics } from "@/lib/calculations/dashboard-metrics";
import { formatWholeDollars } from "@/lib/calculations/utils/money";

import { MetricCard } from "@/components/dashboard/metric-card";
import { ValueDeliveredPanel } from "@/components/dashboard/value-delivered-panel";
import { ProductMixChart } from "@/components/dashboard/product-mix-chart";
import { RecentCheatCodesTable } from "@/components/dashboard/recent-cheatcodes-table";
import { ClientInsightsPanel } from "@/components/dashboard/client-insights-panel";
import { ConversionPipeline } from "@/components/dashboard/conversion-pipeline";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";

interface DashboardContentProps {
  userName: string;
}

export function DashboardContent({ userName }: DashboardContentProps) {
  const { data, isLoading, error } = useDashboard();

  const metrics = useMemo(() => {
    if (!data) return null;
    return computeDashboardMetrics(data);
  }, [data]);

  const today = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  if (isLoading) {
    return (
      <div className="bg-[#0f1419] -m-6 p-6 min-h-screen">
        <DashboardSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#0f1419] -m-6 p-6 min-h-screen">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
          <p className="text-red-400">Failed to load dashboard data.</p>
          <p className="text-sm text-[#5f6b7a] mt-1">{error.message}</p>
        </div>
      </div>
    );
  }

  if (!data || data.clients.length === 0) {
    return (
      <div className="bg-[#0f1419] -m-6 p-6 min-h-screen">
        <DashboardEmptyState />
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="bg-[#0f1419] -m-6 p-6 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">
          Welcome back, {userName}
        </h1>
        <span className="text-sm text-[#5f6b7a]">{today}</span>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        <MetricCard
          title="Total Clients"
          value={metrics.totalClients}
          subtitle={`+${metrics.newClientsThisMonth} this month`}
          icon="users"
          color="gold"
        />
        <MetricCard
          title="Assets Under Management"
          value={formatCompactCurrency(metrics.totalAUM)}
          subtitle={`+${formatCompactCurrency(metrics.aumChangeThisMonth)} this month`}
          icon="dollar"
          color="green"
        />
        <MetricCard
          title="Avg Wealth Increase"
          value={`+${metrics.avgWealthIncrease}%`}
          subtitle="Across all clients"
          icon="trending-up"
          color="green"
        />
        <MetricCard
          title="CheatCodes This Month"
          value={metrics.cheatCodesThisMonth}
          subtitle={`${metrics.cheatCodesChangePercent >= 0 ? "↑" : "↓"} ${Math.abs(metrics.cheatCodesChangePercent)}% vs last month`}
          icon="file-text"
          color="blue"
        />
      </div>

      {/* Middle Row: Value Delivered + Product Mix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <ValueDeliveredPanel
          totalLifetimeWealth={metrics.totalLifetimeWealth}
          totalTaxSavings={metrics.totalTaxSavings}
          totalLegacyProtected={metrics.totalLegacyProtected}
        />
        <ProductMixChart data={metrics.productMix} />
      </div>

      {/* Bottom Row: Recent CheatCodes + Client Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <RecentCheatCodesTable data={metrics.recentCheatCodes} />
        <ClientInsightsPanel
          avgClientAge={metrics.avgClientAge}
          avgDeposit={metrics.avgDeposit}
          filingStatusBreakdown={metrics.filingStatusBreakdown}
          totalClients={metrics.totalClients}
          approachingRMDCount={metrics.approachingRMDCount}
        />
      </div>

      {/* Conversion Pipeline */}
      <ConversionPipeline
        pipeline={metrics.pipeline}
        activePipelineCount={metrics.activePipelineCount}
        totalPipelineValue={metrics.totalPipelineValue}
      />
    </div>
  );
}

/**
 * Format cents into compact currency (e.g., "$1.2M", "$450K", "$5,000")
 */
function formatCompactCurrency(cents: number): string {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1_000_000) {
    return `$${(dollars / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(dollars) >= 1_000) {
    return `$${(dollars / 1_000).toFixed(0)}K`;
  }
  return formatWholeDollars(cents);
}
