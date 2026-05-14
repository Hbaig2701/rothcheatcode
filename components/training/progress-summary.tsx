'use client';

/**
 * Client-side progress summary for the curriculum index. Reads
 * localStorage on mount and renders a "X of N complete · Y of N
 * viewed" status row plus a thin progress bar.
 *
 * Renders a placeholder skeleton on the server so the layout doesn't
 * jump after hydration.
 */

import { useEffect, useState } from 'react';
import { summarize } from '@/lib/training/progress';

interface ProgressSummaryProps {
  allSlugs: string[];
}

export function ProgressSummary({ allSlugs }: ProgressSummaryProps) {
  const [hydrated, setHydrated] = useState(false);
  const [stats, setStats] = useState({ viewedCount: 0, completeCount: 0, total: allSlugs.length });

  useEffect(() => {
    setStats(summarize(allSlugs));
    setHydrated(true);
  }, [allSlugs]);

  const completePct = (stats.completeCount / stats.total) * 100;

  return (
    <div className="rounded-[14px] bg-bg-card border border-border-default p-5">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-xs uppercase tracking-[1.5px] text-text-dimmer">Your progress</div>
        <div className="text-sm tabular-nums text-text-dim">
          {hydrated ? (
            <>
              <span className="font-display font-semibold text-foreground">{stats.completeCount}</span>{' '}
              of {stats.total} complete
              <span className="text-text-dimmer ml-2">
                ({stats.viewedCount} viewed)
              </span>
            </>
          ) : (
            <span className="text-text-dimmer">Loading…</span>
          )}
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-bg-input overflow-hidden">
        <div
          className="h-full bg-gold transition-all duration-500"
          style={{ width: hydrated ? `${completePct}%` : '0%' }}
        />
      </div>
    </div>
  );
}
