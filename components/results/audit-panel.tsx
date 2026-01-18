'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { AuditLogSummary } from '@/lib/audit/types';
import { getCalculationHistory } from '@/lib/audit/log';

interface AuditPanelProps {
  clientId: string;
}

/**
 * Format currency from cents to dollars
 */
function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

/**
 * Format strategy name for display
 */
function formatStrategy(strategy: string): string {
  return strategy
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Audit history row component
 */
function AuditRow({ entry }: { entry: AuditLogSummary }) {
  return (
    <div className="flex items-center justify-between py-3 border-b last:border-b-0">
      <div className="flex items-center gap-4">
        {/* Timestamp */}
        <div className="text-sm text-muted-foreground w-20">
          {formatRelativeTime(entry.created_at)}
        </div>

        {/* Strategy badge */}
        <div className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
          {formatStrategy(entry.strategy)}
        </div>

        {/* Breakeven */}
        <div className="text-sm">
          {entry.break_even_age ? (
            <span>Breakeven: <strong>Age {entry.break_even_age}</strong></span>
          ) : (
            <span className="text-muted-foreground">No breakeven</span>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex items-center gap-6 text-sm">
        <div className="text-right">
          <span className="text-muted-foreground">Tax Savings: </span>
          <span className={entry.total_tax_savings > 0 ? 'text-green-600 font-medium' : ''}>
            {formatCurrency(entry.total_tax_savings)}
          </span>
        </div>
        <div className="text-right">
          <span className="text-muted-foreground">Final Wealth: </span>
          <span className="font-medium">
            {formatCurrency(entry.blueprint_final_wealth)}
          </span>
        </div>
        <div className="text-xs text-muted-foreground w-12">
          v{entry.engine_version}
        </div>
      </div>
    </div>
  );
}

/**
 * Audit Panel Component
 * Displays calculation history for a client
 */
export function AuditPanel({ clientId }: AuditPanelProps) {
  const [history, setHistory] = useState<AuditLogSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadHistory() {
      try {
        const supabase = createClient();
        const data = await getCalculationHistory(supabase, clientId, 20);
        setHistory(data);
      } catch (err) {
        setError('Failed to load calculation history');
        console.error('[AuditPanel] Load error:', err);
      } finally {
        setLoading(false);
      }
    }

    loadHistory();
  }, [clientId]);

  if (loading) {
    return (
      <div className="border rounded-lg p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-muted rounded w-1/3"></div>
          <div className="h-10 bg-muted rounded"></div>
          <div className="h-10 bg-muted rounded"></div>
          <div className="h-10 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border rounded-lg p-6 text-center">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="border rounded-lg p-6 text-center">
        <p className="text-sm text-muted-foreground">
          No calculation history yet. Run a projection to see audit logs here.
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Calculation History</h3>
          <span className="text-sm text-muted-foreground">
            {history.length} calculation{history.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* History list */}
      <div className="divide-y">
        {history.map(entry => (
          <div key={entry.id} className="px-4">
            <AuditRow entry={entry} />
          </div>
        ))}
      </div>

      {/* Footer note */}
      <div className="px-4 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
        Audit logs are immutable and cannot be modified or deleted.
      </div>
    </div>
  );
}
