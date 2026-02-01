'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Projection } from '@/lib/types/projection';
import type { Client } from '@/lib/types/client';
import { extractSummaryMetrics } from '@/lib/calculations/transforms';

// Deep-dive components
import { YearByYearTable } from './year-by-year-table';
import { IRMAAChart } from './irmaa-chart';
import { NIITDisplay } from './niit-display';
import { RothSeasoningTracker } from './roth-seasoning-tracker';
import { ScheduleSummary } from './schedule-summary';

// Summary components from parent
import { SummarySection } from '../summary-section';

/**
 * Tab configuration for deep-dive views
 */
type TabValue = 'summary' | 'baseline' | 'cheatCode' | 'schedule';

const TABS: { value: TabValue; label: string }[] = [
  { value: 'summary', label: 'Summary' },
  { value: 'baseline', label: 'Baseline' },
  { value: 'cheatCode', label: 'CheatCode' },
  { value: 'schedule', label: 'Schedule' },
];

interface DeepDiveTabsProps {
  projection: Projection;
  client: Client;
}

/**
 * DeepDiveTabs - Main tabbed container for deep-dive views
 *
 * Provides URL-synced tab navigation between:
 * - Summary: Stat cards with key metrics
 * - Baseline: Year-by-year table for no-conversion scenario
 * - CheatCode: Year-by-year table with conversion highlighting
 * - Schedule: IRMAA chart, NIIT display, seasoning tracker, and schedule summary
 */
export function DeepDiveTabs({ projection, client }: DeepDiveTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Get current tab from URL, default to 'summary'
  const currentTab = (searchParams.get('tab') as TabValue) || 'summary';

  // Update URL when tab changes (without scroll)
  const handleTabChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', value);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  // Calculate derived values
  const currentYear = new Date().getFullYear();
  // Support both new age field and legacy date_of_birth
  const clientAge = client.age ?? (client.date_of_birth
    ? currentYear - new Date(client.date_of_birth).getFullYear()
    : 62);
  const filingStatus = client.filing_status;

  // Extract summary metrics for Summary tab
  const metrics = extractSummaryMetrics(projection);

  return (
    <Tabs value={currentTab} onValueChange={handleTabChange}>
      <TabsList className="grid w-full grid-cols-4">
        {TABS.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {/* Summary Tab */}
      <TabsContent value="summary" className="mt-6">
        <SummarySection metrics={metrics} />
      </TabsContent>

      {/* Baseline Tab */}
      <TabsContent value="baseline" className="mt-6">
        <YearByYearTable years={projection.baseline_years} scenario="baseline" />
      </TabsContent>

      {/* CheatCode Tab */}
      <TabsContent value="cheatCode" className="mt-6">
        <YearByYearTable years={projection.blueprint_years} scenario="cheatCode" />
      </TabsContent>

      {/* Schedule Tab */}
      <TabsContent value="schedule" className="mt-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left column */}
          <div className="space-y-6">
            <IRMAAChart years={projection.blueprint_years} filingStatus={filingStatus} />
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <NIITDisplay years={projection.blueprint_years} filingStatus={filingStatus} />
            <RothSeasoningTracker
              cheatCodeYears={projection.blueprint_years}
              currentYear={currentYear}
              clientAge={clientAge}
            />
            <ScheduleSummary cheatCodeYears={projection.blueprint_years} />
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
