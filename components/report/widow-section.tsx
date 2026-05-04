'use client';

import type { Client } from '@/lib/types/client';
import { useAnalysis } from '@/lib/queries/analysis';
import { WidowAnalysis } from '@/components/results/widow-analysis';

interface WidowSectionProps {
  client: Client;
}

/**
 * Standalone Widow's Penalty section for the main client report.
 *
 * Surfaces the widow tax-trap analysis directly on the report dashboard
 * (sits below the year-by-year table) instead of being buried in the
 * old Advanced Features tab group.
 *
 * Render conditions:
 *   - client.widow_analysis flag is on
 *   - filing_status is married_filing_jointly (single filers have no transition)
 *
 * If neither is true, the component renders nothing — the section quietly
 * disappears so advisors don't see an empty block.
 */
export function WidowSection({ client }: WidowSectionProps) {
  const isApplicable =
    !!client.widow_analysis &&
    client.filing_status === 'married_filing_jointly';

  // Hooks must run unconditionally; we gate the *render* below.
  const { data: analysis, isLoading, error } = useAnalysis(client.id);

  if (!isApplicable) return null;

  return (
    <div className="bg-bg-card border border-border-default rounded-2xl shadow-sm">
      <div className="px-6 py-5 border-b border-border-default">
        <h2 className="text-xl font-semibold text-foreground">
          Widow&apos;s Penalty Analysis
        </h2>
        <p className="text-sm text-text-dim mt-1">
          The tax impact when one spouse passes — filing status drops to Single,
          one Social Security check is lost, and the surviving spouse moves into
          tighter brackets with a smaller standard deduction. Roth conversions
          done while both spouses are alive can blunt this transition.
        </p>
      </div>

      <div className="p-6">
        {isLoading && (
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-muted rounded w-1/3" />
            <div className="h-64 bg-muted rounded" />
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600">
            Failed to load widow analysis: {error.message}
          </p>
        )}

        {!isLoading && !error && !analysis?.widow && (
          <p className="text-sm text-text-dim italic">
            Widow analysis is enabled for this client but the projection isn&apos;t
            available yet. Save the client and regenerate the projection.
          </p>
        )}

        {analysis?.widow && <WidowAnalysis analysis={analysis.widow} />}
      </div>
    </div>
  );
}
