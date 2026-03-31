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

function getBarColor(score: number) {
  if (score >= 8) return 'bg-green-500';
  if (score >= 5) return 'bg-yellow-500';
  return 'bg-red-500';
}

function getScoreColor(score: number) {
  if (score >= 8) return 'text-green-400';
  if (score >= 5) return 'text-yellow-400';
  return 'text-red-400';
}

function getScoreColorHex(score: number) {
  if (score >= 8) return '#4ade80';
  if (score >= 5) return '#facc15';
  return '#f87171';
}

const MINI_RADIUS = 20;
const MINI_CIRCUMFERENCE = 2 * Math.PI * MINI_RADIUS;

export function MetricsDisplay({ metrics }: MetricsDisplayProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {METRIC_CONFIG.map(({ key, label }) => {
        const dimension = metrics[key] as DimensionScore;
        const isExpanded = expanded === key;

        // Handle both old format (number) and new format (DimensionScore object)
        const score = typeof dimension === 'number' ? dimension : dimension?.score ?? 0;
        const rationale = typeof dimension === 'object' ? dimension?.rationale : null;
        const coachingNote = typeof dimension === 'object' ? dimension?.coachingNote : null;
        const hasDetails = !!(rationale || coachingNote);

        const strokeColor = getScoreColorHex(score);
        const offset = MINI_CIRCUMFERENCE - (score / 10) * MINI_CIRCUMFERENCE;

        return (
          <div
            key={key}
            className="rounded-[12px] border border-border-default bg-bg-card hover:bg-bg-input transition-colors"
          >
            <button
              onClick={() => hasDetails && setExpanded(isExpanded ? null : key)}
              className={`flex items-center w-full p-5 text-left ${hasDetails ? 'cursor-pointer' : 'cursor-default'}`}
            >
              {/* Mini SVG circle */}
              <div className="relative w-12 h-12 flex-shrink-0">
                <svg className="w-full h-full" viewBox="0 0 48 48">
                  <circle
                    cx="24" cy="24" r={MINI_RADIUS}
                    fill="none"
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth="3.5"
                  />
                  <circle
                    cx="24" cy="24" r={MINI_RADIUS}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeDasharray={MINI_CIRCUMFERENCE}
                    strokeDashoffset={offset}
                    transform="rotate(-90 24 24)"
                    className="transition-all duration-500 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-sm font-mono font-bold ${getScoreColor(score)}`}>
                    {score}
                  </span>
                </div>
              </div>

              <div className="flex-1 min-w-0 ml-4">
                <span className="text-base text-foreground leading-tight block mb-2">
                  {label}
                </span>
                <div className="h-1.5 rounded-full bg-bg-card-hover">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${getBarColor(score)}`}
                    style={{ width: `${score * 10}%` }}
                  />
                </div>
              </div>

              {hasDetails && (
                <div className="ml-3 flex-shrink-0">
                  {isExpanded ? (
                    <ChevronDown className="h-5 w-5 text-text-dimmer" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-text-dimmer" />
                  )}
                </div>
              )}
            </button>

            {isExpanded && hasDetails && (
              <div className="px-5 pb-5 space-y-3">
                {rationale && (
                  <p className="text-sm text-text-dim leading-relaxed">
                    {rationale}
                  </p>
                )}
                {coachingNote && (
                  <div className="rounded-[8px] bg-[rgba(212,175,55,0.05)] border border-[rgba(212,175,55,0.12)] px-4 py-3">
                    <p className="text-sm text-gold leading-relaxed">
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
