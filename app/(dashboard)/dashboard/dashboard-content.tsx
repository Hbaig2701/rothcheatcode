"use client";

import { useMemo } from "react";
import { useDashboard } from "@/lib/queries/dashboard";
import { computeDashboardMetrics } from "@/lib/calculations/dashboard-metrics";
import { formatWholeDollars } from "@/lib/calculations/utils/money";

import { MetricCard } from "@/components/dashboard/metric-card";
import { UsageCard } from "@/components/dashboard/usage-card";
import { ValueDeliveredPanel } from "@/components/dashboard/value-delivered-panel";
import { ProductMixChart } from "@/components/dashboard/product-mix-chart";
import { RecentFormulasTable } from "@/components/dashboard/recent-formulas-table";
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
      <div className="p-9">
        <DashboardSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-9">
        <div className="bg-red-bg border border-red/20 rounded-[14px] p-6 text-center">
          <p className="text-red">Failed to load dashboard data.</p>
          <p className="text-sm text-text-dim mt-1">{error.message}</p>
        </div>
      </div>
    );
  }

  if (!data || data.clients.length === 0) {
    return (
      <div className="p-9">
        <DashboardEmptyState />
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="p-9">
      {/* Header */}
      <div className="flex justify-between items-start mb-9">
        <div>
          <h1 className="font-display text-[30px] font-normal text-foreground">
            Welcome back, {userName}
          </h1>
          <p className="text-sm text-text-muted mt-1.5">
            Here&apos;s your practice overview
          </p>
        </div>
        <span className="text-sm font-mono text-text-dim">
          {today}
        </span>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
        <MetricCard
          title="Total Clients"
          value={metrics.totalClients}
          subtitle={`+${metrics.newClientsThisMonth} this month`}
          icon="users"
        />
        <MetricCard
          title="Assets Under Management"
          value={formatCompactCurrency(metrics.totalAUM)}
          subtitle={`+${formatCompactCurrency(metrics.aumChangeThisMonth)} this month`}
          icon="dollar"
        />
        <MetricCard
          title="Avg Wealth Increase"
          value={`${metrics.avgWealthIncrease >= 0 ? "+" : ""}${metrics.avgWealthIncrease}%`}
          subtitle="Across all clients"
          icon="trending-up"
        />
        <UsageCard usage={metrics.usage} />
      </div>

      {/* Middle Row: Value Delivered + Product Mix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-7">
        <ValueDeliveredPanel
          totalLifetimeWealth={metrics.totalLifetimeWealth}
          totalTaxSavings={metrics.totalTaxSavings}
          totalLegacyProtected={metrics.totalLegacyProtected}
        />
        <ProductMixChart data={metrics.productMix} />
      </div>

      {/* Bottom Row: Recent Formulas + Client Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-7">
        <RecentFormulasTable data={metrics.recentFormulas} />
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
