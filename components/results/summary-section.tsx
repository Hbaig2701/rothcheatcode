'use client';

import { StatCard } from './stat-card';
import { type SummaryMetrics, formatCurrency } from '@/lib/calculations/transforms';

interface SummarySectionProps {
  metrics: SummaryMetrics;
}

export function SummarySection({ metrics }: SummarySectionProps) {
  const differenceFormatted = formatCurrency(Math.abs(metrics.difference));
  const differenceSign = metrics.difference >= 0 ? '+' : '-';

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Baseline card - no highlight */}
      <StatCard
        title="Baseline Ending Wealth"
        value={metrics.baselineEndWealth}
        prefix="$"
        className="border-gray-300"
      />

      {/* CheatCode card - highlighted with blue border */}
      <StatCard
        title="CheatCode Ending Wealth"
        value={metrics.cheatCodeEndWealth}
        prefix="$"
        trend={metrics.difference >= 0 ? 'up' : 'down'}
        trendLabel={`${differenceSign}${differenceFormatted} vs Baseline`}
        highlight={true}
      />

      {/* Tax Savings card */}
      <StatCard
        title="Total Lifetime Tax Savings"
        value={metrics.totalTaxSavings}
        prefix="$"
        trend={metrics.totalTaxSavings > 0 ? 'up' : 'neutral'}
        trendLabel={metrics.breakEvenAge
          ? `Breakeven at age ${metrics.breakEvenAge}`
          : 'No breakeven in projection'}
      />
    </div>
  );
}
