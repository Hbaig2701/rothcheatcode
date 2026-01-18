'use client';

import { useState } from 'react';
import { useMultiStrategy } from '@/lib/hooks/use-multi-strategy';
import { transformToChartData, extractSummaryMetrics } from '@/lib/calculations/transforms';
import { StrategyComparisonTable } from './strategy-comparison';
import { SummarySection } from './summary-section';
import { WealthChart } from './wealth-chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StrategyType } from '@/lib/calculations/types';
import { STRATEGY_DEFINITIONS } from '@/lib/calculations/strategy-definitions';

interface MultiStrategyResultsProps {
  clientId: string;
  clientName: string;
}

export function MultiStrategyResults({ clientId, clientName }: MultiStrategyResultsProps) {
  const { data, isLoading, isError, error, refetch } = useMultiStrategy({ clientId });

  // Selected strategy for detail view - defaults to best when data loads
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyType | null>(null);

  // Determine which strategy to show in detail view
  const activeStrategy = selectedStrategy ?? data?.result.bestStrategy ?? 'moderate';

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Results for {clientName}</h1>
          <p className="text-muted-foreground">Calculating all 4 strategies...</p>
        </div>
        {/* Comparison table skeleton */}
        <Skeleton className="h-[300px]" />
        {/* Summary cards skeleton */}
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-[120px]" />
          <Skeleton className="h-[120px]" />
          <Skeleton className="h-[120px]" />
        </div>
        {/* Chart skeleton */}
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Results for {clientName}</h1>
        </div>
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Error Loading Results
            </CardTitle>
            <CardDescription>
              {error instanceof Error ? error.message : 'Failed to calculate projections'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => refetch()} variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No data state (shouldn't happen but defensive)
  if (!data?.result) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Results for {clientName}</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>No Projection Data</CardTitle>
            <CardDescription>
              Unable to calculate projections for this client.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Calculate Projections
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { result, cached } = data;
  const selectedResult = result.strategies[activeStrategy];

  // Transform selected strategy data for display
  const chartData = transformToChartData(selectedResult);
  const metrics = extractSummaryMetrics(selectedResult);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Results for {clientName}</h1>
          <p className="text-muted-foreground">
            Comparing 4 Roth conversion strategies
            {cached && <span className="ml-2 text-xs">(cached)</span>}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          title="Recalculate with current client data"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Recalculate
        </Button>
      </div>

      {/* Strategy Comparison Table */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Strategy Comparison</h2>
        <StrategyComparisonTable
          result={result}
          selectedStrategy={activeStrategy}
          onStrategySelect={setSelectedStrategy}
        />
      </section>

      {/* Selected Strategy Detail View */}
      <section>
        <h2 className="text-lg font-semibold mb-4">
          {STRATEGY_DEFINITIONS[activeStrategy].name} Strategy Details
        </h2>

        {/* Summary Cards */}
        <div className="mb-6">
          <SummarySection metrics={metrics} />
        </div>

        {/* Wealth Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Wealth Projection</CardTitle>
            <CardDescription>
              Baseline (no conversion) vs {STRATEGY_DEFINITIONS[activeStrategy].name} (Roth conversion)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WealthChart data={chartData} breakEvenAge={metrics.breakEvenAge} />
          </CardContent>
        </Card>

        {/* Heir Benefit Card (if positive) */}
        {metrics.heirBenefit > 0 && (
          <Card className="mt-6">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Benefit to Heirs</p>
                  <p className="text-xl font-semibold text-green-600">
                    +${(metrics.heirBenefit / 100).toLocaleString()}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground max-w-md">
                  Based on heir tax bracket, heirs receive more from the {STRATEGY_DEFINITIONS[activeStrategy].name} strategy
                  due to tax-free Roth distributions.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
