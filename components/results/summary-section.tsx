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
      {/* Baseline card - no highlight. After-tax net legacy (heir tax netted off
          the remaining Traditional IRA), matching the main report + PDF. */}
      <StatCard
        title="Baseline Net Legacy (After-Tax)"
        value={metrics.baselineEndWealth}
        prefix="$"
        className="border-gray-300"
      />

      {/* Strategy card - highlighted with blue border */}
      <StatCard
        title="Strategy Net Legacy (After-Tax)"
        value={metrics.formulaEndWealth}
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
