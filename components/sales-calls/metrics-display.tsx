'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { CallMetrics, DimensionScore } from '@/lib/types/sales-call';

interface MetricsDisplayProps {
  metrics: CallMetrics;
}

const METRIC_CONFIG: { key: keyof CallMetrics; label: string }[] = [
  { key: 'problemFraming', label: 'Problem Framing' },
  { key: 'discoveryQuality', label: 'Discovery Quality' },
  { key: 'painDelivery', label: 'Pain Delivery' },
  { key: 'solutionClarity', label: 'Solution Clarity' },
  { key: 'objectionHandling', label: 'Objection Handling' },
  { key: 'socialProof', label: 'Social Proof & Credibility' },
  { key: 'processNextSteps', label: 'Process & Next Steps' },
  { key: 'talkTimeListening', label: 'Talk Time & Listening' },
];

export function MetricsDisplay({ metrics }: MetricsDisplayProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const getBarColor = (score: number) => {
    if (score >= 8) return 'bg-green-500';
    if (score >= 5) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-green-400';
    if (score >= 5) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="space-y-3">
      {METRIC_CONFIG.map(({ key, label }) => {
        const dimension = metrics[key] as DimensionScore;
        const isExpanded = expanded === key;

        // Handle both old format (number) and new format (DimensionScore object)
        const score = typeof dimension === 'number' ? dimension : dimension?.score ?? 0;
        const rationale = typeof dimension === 'object' ? dimension?.rationale : null;
        const coachingNote = typeof dimension === 'object' ? dimension?.coachingNote : null;

        return (
          <div key={key} className="rounded-lg border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)]">
            <button
              onClick={() => setExpanded(isExpanded ? null : key)}
              className="flex items-center w-full px-4 py-3 text-left hover:bg-[rgba(255,255,255,0.02)] transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-[rgba(255,255,255,0.8)]">{label}</span>
                  <span className={`text-sm font-bold ${getScoreColor(score)}`}>{score}/10</span>
                </div>
                <div className="h-1.5 rounded-full bg-[rgba(255,255,255,0.08)]">
                  <div
                    className={`h-full rounded-full transition-all ${getBarColor(score)}`}
                    style={{ width: `${score * 10}%` }}
                  />
                </div>
              </div>
              {(rationale || coachingNote) && (
                <div className="ml-3 flex-shrink-0">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-[rgba(255,255,255,0.3)]" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-[rgba(255,255,255,0.3)]" />
                  )}
                </div>
              )}
            </button>

            {isExpanded && (rationale || coachingNote) && (
              <div className="px-4 pb-3 space-y-2">
                {rationale && (
                  <p className="text-xs text-[rgba(255,255,255,0.6)] leading-relaxed">
                    {rationale}
                  </p>
                )}
                {coachingNote && (
                  <div className="rounded-md bg-gold/5 border border-gold/10 px-3 py-2">
                    <p className="text-xs text-gold leading-relaxed">
                      <span className="font-semibold">Coach:</span> {coachingNote}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
