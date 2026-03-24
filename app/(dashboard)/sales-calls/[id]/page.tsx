'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  FileText,
  ThumbsUp,
  AlertTriangle,
  ListChecks,
  Sparkles,
  BarChart3,
  RefreshCw,
  Trash2,
  Clock,
} from 'lucide-react';
import { useSalesCall, useReanalyzeSalesCall, useDeleteSalesCall } from '@/lib/queries/sales-calls';
import { ScoreBadge } from '@/components/sales-calls/score-badge';
import { AnalysisCard } from '@/components/sales-calls/analysis-card';
import { MetricsDisplay } from '@/components/sales-calls/metrics-display';
import { TranscriptViewer } from '@/components/sales-calls/transcript-viewer';
import { Button } from '@/components/ui/button';

export default function SalesCallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: call, isLoading, isError, error } = useSalesCall(id);
  const reanalyzeMutation = useReanalyzeSalesCall();
  const deleteMutation = useDeleteSalesCall();

  const handleReanalyze = async () => {
    await reanalyzeMutation.mutateAsync(id);
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this sales call?')) return;
    await deleteMutation.mutateAsync(id);
    router.push('/sales-calls');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const remMins = mins % 60;
      return `${hrs}h ${remMins}m`;
    }
    return `${mins}m ${secs}s`;
  };

  if (isLoading) {
    return (
      <div className="p-9">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      </div>
    );
  }

  if (isError || !call) {
    return (
      <div className="p-9">
        <button
          onClick={() => router.push('/sales-calls')}
          className="inline-flex items-center gap-2 text-sm text-[rgba(255,255,255,0.6)] hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Sales Calls
        </button>
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-sm text-red-400 mb-2">Failed to load sales call</p>
          <p className="text-xs text-[rgba(255,255,255,0.4)]">{error?.message}</p>
        </div>
      </div>
    );
  }

  const isProcessing = ['uploading', 'transcribing', 'analyzing'].includes(call.status);
  const analysis = call.analysis_results;

  return (
    <div className="p-9 max-w-4xl">
      {/* Back link */}
      <button
        onClick={() => router.push('/sales-calls')}
        className="inline-flex items-center gap-2 text-sm text-[rgba(255,255,255,0.6)] hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Sales Calls
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-normal text-white mb-2">
            {call.title || 'Untitled Call'}
          </h1>
          <div className="flex items-center gap-4 text-sm text-[rgba(255,255,255,0.5)]">
            <span>{formatDate(call.call_date)}</span>
            {call.duration_seconds && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {formatDuration(call.duration_seconds)}
              </span>
            )}
          </div>
          {call.notes && (
            <p className="text-sm text-[rgba(255,255,255,0.5)] mt-2">{call.notes}</p>
          )}
        </div>

        {call.overall_score !== null && call.status === 'complete' && (
          <ScoreBadge score={call.overall_score} size="lg" />
        )}
      </div>

      {/* Processing state */}
      {isProcessing && (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] mb-6">
          <Loader2 className="h-10 w-10 animate-spin text-gold mb-4" />
          <p className="text-sm font-medium text-white mb-1">
            {call.status === 'uploading' && 'Uploading recording...'}
            {call.status === 'transcribing' && 'Transcribing audio...'}
            {call.status === 'analyzing' && 'Analyzing transcript...'}
          </p>
          <p className="text-xs text-[rgba(255,255,255,0.4)]">
            This may take a minute. This page will update automatically.
          </p>
        </div>
      )}

      {/* Failed state */}
      {call.status === 'failed' && (
        <div className="flex flex-col items-center py-12 rounded-xl border border-red-500/20 bg-red-500/5 mb-6">
          <AlertTriangle className="h-8 w-8 text-red-400 mb-3" />
          <p className="text-sm font-medium text-white mb-1">Analysis Failed</p>
          <p className="text-xs text-[rgba(255,255,255,0.5)] mb-4">
            {call.error_message || 'An unexpected error occurred'}
          </p>
          {call.transcript_text && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReanalyze}
              disabled={reanalyzeMutation.isPending}
            >
              {reanalyzeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Try Again
            </Button>
          )}
        </div>
      )}

      {/* Analysis results */}
      {call.status === 'complete' && analysis && (
        <div className="space-y-5">
          {/* Summary */}
          <AnalysisCard title="Summary" icon={FileText}>
            <p className="text-sm text-[rgba(255,255,255,0.8)] leading-relaxed">
              {analysis.summary}
            </p>
          </AnalysisCard>

          {/* Metrics */}
          <AnalysisCard title="Performance Metrics" icon={BarChart3}>
            <MetricsDisplay metrics={analysis.metrics} />
          </AnalysisCard>

          {/* Strengths */}
          <AnalysisCard title="Strengths" icon={ThumbsUp} variant="success">
            <ul className="space-y-2.5">
              {analysis.strengths.map((strength, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-[rgba(255,255,255,0.8)]">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-green-400 flex-shrink-0" />
                  {strength}
                </li>
              ))}
            </ul>
          </AnalysisCard>

          {/* Improvements */}
          <AnalysisCard title="Areas for Improvement" icon={AlertTriangle} variant="warning">
            <ul className="space-y-2.5">
              {analysis.improvements.map((improvement, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-[rgba(255,255,255,0.8)]">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-yellow-400 flex-shrink-0" />
                  {improvement}
                </li>
              ))}
            </ul>
          </AnalysisCard>

          {/* Next Steps */}
          <AnalysisCard title="Actionable Next Steps" icon={ListChecks}>
            <ul className="space-y-2.5">
              {analysis.nextSteps.map((step, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-[rgba(255,255,255,0.8)]">
                  <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-md bg-gold/10 text-gold text-xs font-bold flex-shrink-0">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ul>
          </AnalysisCard>

          {/* Key Moments */}
          {analysis.keyMoments && analysis.keyMoments.length > 0 && (
            <AnalysisCard title="Key Moments" icon={Sparkles}>
              <ul className="space-y-2.5">
                {analysis.keyMoments.map((moment, i) => {
                  const dotColor = {
                    positive: 'bg-green-400',
                    negative: 'bg-red-400',
                    neutral: 'bg-[rgba(255,255,255,0.4)]',
                  }[moment.sentiment];
                  return (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-[rgba(255,255,255,0.8)]">
                      <span className={`mt-1.5 h-1.5 w-1.5 rounded-full ${dotColor} flex-shrink-0`} />
                      {moment.description}
                    </li>
                  );
                })}
              </ul>
            </AnalysisCard>
          )}

          {/* Transcript */}
          {call.transcript_text && (
            <TranscriptViewer transcript={call.transcript_text} />
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4">
            <Button
              variant="outline"
              onClick={handleReanalyze}
              disabled={reanalyzeMutation.isPending}
            >
              {reanalyzeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Re-analyze
            </Button>
            <Button
              variant="outline"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="text-red-400 hover:text-red-300 hover:border-red-500/30"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
