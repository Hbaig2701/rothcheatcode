'use client';

import { useProjection } from '@/lib/queries/projections';
import { transformToChartData, extractSummaryMetrics } from '@/lib/calculations/transforms';
import { SummarySection } from './summary-section';
import { WealthChart } from './wealth-chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ResultsSummaryProps {
  clientId: string;
  clientName: string;
}

export function ResultsSummary({ clientId, clientName }: ResultsSummaryProps) {
  const { data, isLoading, isError, error, refetch } = useProjection(clientId);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Results for {clientName}</h1>
          <p className="text-muted-foreground">Calculating projections...</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-[120px]" />
          <Skeleton className="h-[120px]" />
          <Skeleton className="h-[120px]" />
        </div>
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
              {error instanceof Error ? error.message : 'Failed to load projection data'}
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
  if (!data?.projection) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Results for {clientName}</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>No Projection Data</CardTitle>
            <CardDescription>
              No projection has been calculated for this client yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Calculate Projection
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Transform data for display
  const { projection, cached } = data;
  const chartData = transformToChartData(projection);
  const metrics = extractSummaryMetrics(projection);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Results for {clientName}</h1>
          <p className="text-muted-foreground">
            {projection.projection_years}-year projection using {projection.strategy} strategy
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

      {/* Summary Cards */}
      <SummarySection metrics={metrics} />

      {/* Wealth Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Wealth Projection</CardTitle>
          <CardDescription>
            Comparing net worth over time: Baseline (no conversion) vs Blueprint (Roth conversion)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WealthChart data={chartData} breakEvenAge={metrics.breakEvenAge} />
        </CardContent>
      </Card>

      {/* Additional metrics footer */}
      {metrics.heirBenefit > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Benefit to Heirs</p>
                <p className="text-xl font-semibold text-green-600">
                  +${(metrics.heirBenefit / 100).toLocaleString()}
                </p>
              </div>
              <p className="text-sm text-muted-foreground max-w-md">
                Based on current heir tax bracket, heirs would receive more from the Blueprint scenario
                due to tax-free Roth distributions.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
