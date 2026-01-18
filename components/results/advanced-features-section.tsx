'use client';

import { useState } from 'react';
import type { Client } from '@/lib/types/client';
import type { ChartDataPoint } from '@/lib/calculations/transforms';
import { useAnalysis } from '@/lib/queries/analysis';
import { BreakevenChart } from './breakeven-chart';
import { SensitivityChart } from './sensitivity-chart';
import { WidowAnalysis } from './widow-analysis';
import { AuditPanel } from './audit-panel';

interface AdvancedFeaturesSectionProps {
  client: Client;
  chartData: ChartDataPoint[];
}

type TabId = 'breakeven' | 'sensitivity' | 'widow' | 'audit';

interface Tab {
  id: TabId;
  label: string;
  enabled: boolean;
}

/**
 * Container component for all advanced analysis features
 * Shows tabs for: Breakeven, Sensitivity, Widow's Penalty, Audit Log
 */
export function AdvancedFeaturesSection({
  client,
  chartData,
}: AdvancedFeaturesSectionProps) {
  const { data: analysis, isLoading, error } = useAnalysis(client.id);

  // Determine which tabs are enabled based on client settings
  const tabs: Tab[] = [
    { id: 'breakeven', label: 'Breakeven Analysis', enabled: true },
    { id: 'sensitivity', label: 'Sensitivity', enabled: client.sensitivity },
    {
      id: 'widow',
      label: "Widow's Penalty",
      enabled: client.widow_analysis && client.filing_status === 'married_filing_jointly',
    },
    { id: 'audit', label: 'Audit Log', enabled: true },
  ];

  const enabledTabs = tabs.filter(t => t.enabled);
  const [activeTab, setActiveTab] = useState<TabId>(enabledTabs[0]?.id ?? 'breakeven');

  if (isLoading) {
    return (
      <div className="mt-8 border rounded-lg p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-1/4"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8 border rounded-lg p-6 text-center">
        <p className="text-sm text-red-600">
          Failed to load analysis: {error.message}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      {/* Section header */}
      <h2 className="text-xl font-semibold mb-4">Advanced Analysis</h2>

      {/* Tab navigation */}
      <div className="border-b mb-6">
        <nav className="flex gap-4" aria-label="Analysis tabs">
          {enabledTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="min-h-[400px]">
        {/* Breakeven Tab */}
        {activeTab === 'breakeven' && analysis?.breakeven && (
          <BreakevenChart data={chartData} analysis={analysis.breakeven} />
        )}

        {/* Sensitivity Tab */}
        {activeTab === 'sensitivity' && analysis?.sensitivity && (
          <SensitivityChart result={analysis.sensitivity} />
        )}

        {/* Widow's Penalty Tab */}
        {activeTab === 'widow' && analysis?.widow && (
          <WidowAnalysis analysis={analysis.widow} />
        )}

        {/* Audit Log Tab */}
        {activeTab === 'audit' && (
          <AuditPanel clientId={client.id} />
        )}

        {/* Fallback for disabled/missing data */}
        {activeTab === 'sensitivity' && !analysis?.sensitivity && (
          <div className="text-center py-12 text-muted-foreground">
            <p>Sensitivity analysis not enabled for this client.</p>
            <p className="text-sm mt-2">
              Enable &quot;Run sensitivity analysis&quot; in Advanced Options to see scenario comparisons.
            </p>
          </div>
        )}

        {activeTab === 'widow' && !analysis?.widow && (
          <div className="text-center py-12 text-muted-foreground">
            <p>Widow&apos;s penalty analysis not available.</p>
            <p className="text-sm mt-2">
              This analysis is only available for Married Filing Jointly clients
              with &quot;Widow analysis&quot; enabled.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
