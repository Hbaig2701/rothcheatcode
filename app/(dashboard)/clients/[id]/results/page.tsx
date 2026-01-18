'use client';

import { use } from 'react';
import { useClient } from '@/lib/queries/clients';
import { useProjection } from '@/lib/queries/projections';
import { MultiStrategyResults, DeepDiveTabs, AdvancedFeaturesSection } from '@/components/results';
import { transformToChartData } from '@/lib/calculations/transforms';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface ResultsPageProps {
  params: Promise<{ id: string }>;
}

export default function ResultsPage({ params }: ResultsPageProps) {
  const { id: clientId } = use(params);

  // Fetch client data
  const {
    data: client,
    isLoading: clientLoading,
    error: clientError,
  } = useClient(clientId);

  // Fetch projection data for deep-dive views
  const {
    data: projectionResponse,
    isLoading: projectionLoading,
    error: projectionError,
  } = useProjection(clientId);

  // Loading state
  if (clientLoading || projectionLoading) {
    return (
      <div className="container py-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px]" />
        <Skeleton className="h-[600px]" />
      </div>
    );
  }

  // Error state
  if (clientError || projectionError) {
    return (
      <div className="container py-6">
        <div className="text-center py-12">
          <p className="text-destructive">
            Error loading results: {clientError?.message || projectionError?.message}
          </p>
          <Button variant="outline" className="mt-4" render={<Link href={`/clients/${clientId}`} />}>
            Back to Client
          </Button>
        </div>
      </div>
    );
  }

  // No data state
  if (!client || !projectionResponse?.projection) {
    return (
      <div className="container py-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">No projection data available</p>
          <Button variant="outline" className="mt-4" render={<Link href={`/clients/${clientId}`} />}>
            Back to Client
          </Button>
        </div>
      </div>
    );
  }

  const { projection } = projectionResponse;

  // Transform projection data for charts
  const chartData = transformToChartData(projection);

  return (
    <div className="container py-6 space-y-8">
      {/* Header with back navigation */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" render={<Link href={`/clients/${clientId}`} />}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{client.name} - Results</h1>
          <p className="text-muted-foreground">
            {projection.strategy.charAt(0).toUpperCase() + projection.strategy.slice(1).replace('_', ' ')} Strategy | {projection.projection_years} Year Projection
          </p>
        </div>
      </div>

      {/* Multi-Strategy Comparison */}
      <MultiStrategyResults clientId={clientId} clientName={client.name} />

      {/* Deep Dive Views */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Deep Dive Analysis</h2>
        <DeepDiveTabs projection={projection} client={client} />
      </section>

      {/* Advanced Features Section */}
      <section>
        <AdvancedFeaturesSection client={client} chartData={chartData} />
      </section>
    </div>
  );
}
