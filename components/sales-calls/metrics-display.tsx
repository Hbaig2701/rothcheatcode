'use client';

import type { CallMetrics } from '@/lib/types/sales-call';

interface MetricsDisplayProps {
  metrics: CallMetrics;
}

const METRIC_LABELS: Record<keyof CallMetrics, string> = {
  rapportBuilding: 'Rapport Building',
  needsDiscovery: 'Needs Discovery',
  productKnowledge: 'Product Knowledge',
  objectionHandling: 'Objection Handling',
  closingAbility: 'Closing Ability',
  complianceAdherence: 'Compliance',
};

export function MetricsDisplay({ metrics }: MetricsDisplayProps) {
  const getBarColor = (score: number) => {
    if (score >= 8) return 'bg-green-500';
    if (score >= 5) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {(Object.entries(METRIC_LABELS) as [keyof CallMetrics, string][]).map(([key, label]) => {
        const score = metrics[key];
        return (
          <div key={key}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm text-[rgba(255,255,255,0.7)]">{label}</span>
              <span className="text-sm font-semibold text-white">{score}/10</span>
            </div>
            <div className="h-2 rounded-full bg-[rgba(255,255,255,0.08)]">
              <div
                className={`h-full rounded-full transition-all ${getBarColor(score)}`}
                style={{ width: `${score * 10}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
