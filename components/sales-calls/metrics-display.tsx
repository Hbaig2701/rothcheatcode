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

const MINI_RADIUS = 16;
const MINI_CIRCUMFERENCE = 2 * Math.PI * MINI_RADIUS;

export function MetricsDisplay({ metrics }: MetricsDisplayProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            className="rounded-[12px] border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.04)] transition-colors"
          >
            <button
              onClick={() => hasDetails && setExpanded(isExpanded ? null : key)}
              className={`flex items-center w-full p-4 text-left ${hasDetails ? 'cursor-pointer' : 'cursor-default'}`}
            >
              {/* Mini SVG circle */}
              <div className="relative w-10 h-10 flex-shrink-0">
                <svg className="w-full h-full" viewBox="0 0 40 40">
                  <circle
                    cx="20" cy="20" r={MINI_RADIUS}
                    fill="none"
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth="3"
                  />
                  <circle
                    cx="20" cy="20" r={MINI_RADIUS}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={MINI_CIRCUMFERENCE}
                    strokeDashoffset={offset}
                    transform="rotate(-90 20 20)"
                    className="transition-all duration-500 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-xs font-mono font-bold ${getScoreColor(score)}`}>
                    {score}
                  </span>
                </div>
              </div>

              <div className="flex-1 min-w-0 ml-3">
                <span className="text-sm text-[rgba(255,255,255,0.8)] leading-tight block mb-1.5">
                  {label}
                </span>
                <div className="h-1 rounded-full bg-[rgba(255,255,255,0.06)]">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${getBarColor(score)}`}
                    style={{ width: `${score * 10}%` }}
                  />
                </div>
              </div>

              {hasDetails && (
                <div className="ml-2 flex-shrink-0">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-[rgba(255,255,255,0.3)]" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-[rgba(255,255,255,0.3)]" />
                  )}
                </div>
              )}
            </button>

            {isExpanded && hasDetails && (
              <div className="px-4 pb-4 space-y-2">
                {rationale && (
                  <p className="text-xs text-[rgba(255,255,255,0.6)] leading-relaxed">
                    {rationale}
                  </p>
                )}
                {coachingNote && (
                  <div className="rounded-[8px] bg-[rgba(212,175,55,0.05)] border border-[rgba(212,175,55,0.12)] px-3 py-2">
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
