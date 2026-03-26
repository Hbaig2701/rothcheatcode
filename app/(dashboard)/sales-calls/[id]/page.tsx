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
  BarChart3,
  RefreshCw,
  Trash2,
  Clock,
  ShieldAlert,
  Target,
} from 'lucide-react';
import { useSalesCall, useReanalyzeSalesCall, useDeleteSalesCall } from '@/lib/queries/sales-calls';
import { ScoreBadge } from '@/components/sales-calls/score-badge';
import { AnalysisCard } from '@/components/sales-calls/analysis-card';
import { MetricsDisplay } from '@/components/sales-calls/metrics-display';
import { TranscriptViewer } from '@/components/sales-calls/transcript-viewer';
import { Button } from '@/components/ui/button';

const CALL_STAGE_LABELS: Record<string, string> = {
  prospecting: 'Prospecting',
  discovery: 'Discovery',
  pain_presentation: 'Pain Presentation',
  solution_presentation: 'Solution Presentation',
  objection_handling: 'Objection Handling',
  close: 'Close',
};

const GRADE_COLORS: Record<string, string> = {
  A: 'text-green-400 bg-green-500/10 border-green-500/20',
  B: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  C: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  D: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  F: 'text-red-400 bg-red-500/10 border-red-500/20',
};

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
          className="inline-flex items-center gap-2.5 text-sm text-[rgba(255,255,255,0.6)] hover:text-white transition-colors mb-8 group"
        >
          <div className="w-8 h-8 rounded-[10px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] flex items-center justify-center group-hover:border-[rgba(212,175,55,0.3)] group-hover:bg-[rgba(212,175,55,0.06)] transition-all">
            <ArrowLeft className="h-4 w-4" />
          </div>
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
    <div className="p-9 max-w-6xl">
      {/* Back link */}
      <button
        onClick={() => router.push('/sales-calls')}
        className="inline-flex items-center gap-2.5 text-sm text-[rgba(255,255,255,0.6)] hover:text-white transition-colors mb-8 group"
      >
        <div className="w-8 h-8 rounded-[10px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] flex items-center justify-center group-hover:border-[rgba(212,175,55,0.3)] group-hover:bg-[rgba(212,175,55,0.06)] transition-all">
          <ArrowLeft className="h-4 w-4" />
        </div>
        Back to Sales Calls
      </button>

      {/* Hero Header Card */}
      <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-7 mb-8">
        <div className="flex items-center gap-8">
          {/* Score Ring (only when complete) */}
          {call.status === 'complete' && analysis && analysis.overallScore != null && (
            <div className="flex-shrink-0 flex flex-col items-center gap-3">
              <ScoreBadge score={Math.round(analysis.overallScore * 10)} size="lg" />
              {analysis.letterGrade && (
                <span className={`inline-flex items-center justify-center h-10 w-10 rounded-[10px] border text-lg font-bold ${GRADE_COLORS[analysis.letterGrade] || GRADE_COLORS.C}`}>
                  {analysis.letterGrade}
                </span>
              )}
            </div>
          )}

          {/* Title + metadata */}
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-[26px] font-normal text-white mb-2">
              {call.title || 'Untitled Call'}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-sm text-[rgba(255,255,255,0.5)]">
              <span>{formatDate(call.call_date)}</span>
              {call.duration_seconds && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDuration(call.duration_seconds)}
                </span>
              )}
              {analysis?.callStage && (
                <span className="rounded-[20px] bg-[rgba(212,175,55,0.08)] border border-[rgba(212,175,55,0.2)] px-3 py-0.5 text-xs font-medium text-gold">
                  {CALL_STAGE_LABELS[analysis.callStage] || analysis.callStage}
                </span>
              )}
            </div>
            {call.notes && (
              <p className="text-sm text-[rgba(255,255,255,0.45)] mt-3 leading-relaxed">{call.notes}</p>
            )}
          </div>
        </div>
      </div>

      {/* Processing state */}
      {isProcessing && (
        <div className="flex flex-col items-center justify-center py-16 rounded-[14px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.025)] mb-6">
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
        <div className="flex flex-col items-center py-12 rounded-[14px] border border-red-500/20 bg-red-500/5 mb-6">
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
        <div className="space-y-6">
          {/* Summary */}
          <AnalysisCard title="Summary" icon={FileText}>
            <p className="text-sm text-[rgba(255,255,255,0.8)] leading-relaxed">
              {analysis.summary}
            </p>
          </AnalysisCard>

          {/* Performance Metrics */}
          <AnalysisCard title="Performance Metrics" icon={BarChart3}>
            <MetricsDisplay metrics={analysis.metrics} />
          </AnalysisCard>

          {/* Moments Done Well + Missed Opportunities — side by side on wide screens */}
          {((analysis.momentsDoneWell?.length ?? 0) > 0 || (analysis.missedOpportunities?.length ?? 0) > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Moments Done Well */}
              {analysis.momentsDoneWell && analysis.momentsDoneWell.length > 0 && (
                <AnalysisCard title="Top Moments Done Well" icon={ThumbsUp} variant="success">
                  <ul className="space-y-5">
                    {analysis.momentsDoneWell.map((moment, i) => (
                      <li key={i} className="space-y-2">
                        <div className="border-l-2 border-green-500/40 pl-4">
                          <p className="text-sm text-[rgba(255,255,255,0.55)] italic leading-relaxed">
                            &ldquo;{moment.quote}&rdquo;
                          </p>
                        </div>
                        <p className="text-sm text-[rgba(255,255,255,0.8)] pl-4 leading-relaxed">
                          {moment.explanation}
                        </p>
                      </li>
                    ))}
                  </ul>
                </AnalysisCard>
              )}

              {/* Missed Opportunities */}
              {analysis.missedOpportunities && analysis.missedOpportunities.length > 0 && (
                <AnalysisCard title="Missed Opportunities" icon={Target} variant="warning">
                  <ul className="space-y-6">
                    {analysis.missedOpportunities.map((opp, i) => (
                      <li key={i} className="space-y-2">
                        <div className="border-l-2 border-yellow-500/40 pl-4">
                          <p className="text-sm text-[rgba(255,255,255,0.55)] italic leading-relaxed">
                            &ldquo;{opp.quote}&rdquo;
                          </p>
                        </div>
                        <p className="text-sm text-[rgba(255,255,255,0.8)] pl-4 leading-relaxed">
                          {opp.explanation}
                        </p>
                        <div className="ml-4 rounded-[10px] bg-[rgba(212,175,55,0.05)] border border-[rgba(212,175,55,0.12)] px-4 py-3">
                          <p className="text-xs text-[rgba(255,255,255,0.5)] mb-1 font-medium uppercase tracking-[1.5px]">Suggested language</p>
                          <p className="text-sm text-gold italic">
                            &ldquo;{opp.betterLanguage}&rdquo;
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </AnalysisCard>
              )}
            </div>
          )}

          {/* Compliance Flags + Action Items — side by side on wide screens */}
          {((analysis.complianceFlags?.length ?? 0) > 0 || (analysis.priorityActions?.length ?? 0) > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Compliance Flags */}
              {analysis.complianceFlags && analysis.complianceFlags.length > 0 && (
                <AnalysisCard title="Compliance Flags" icon={ShieldAlert} variant="danger">
                  <ul className="space-y-4">
                    {analysis.complianceFlags.map((flag, i) => (
                      <li key={i} className="rounded-[10px] bg-[rgba(248,113,113,0.06)] border border-red-500/15 p-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <ShieldAlert className="h-4 w-4 text-red-400 flex-shrink-0" />
                          <p className="text-sm font-semibold text-red-400 uppercase tracking-wider">
                            {flag.issue}
                          </p>
                        </div>
                        <div className="border-l-2 border-red-500/30 pl-3 ml-2">
                          <p className="text-sm text-[rgba(255,255,255,0.55)] italic">
                            &ldquo;{flag.quote}&rdquo;
                          </p>
                        </div>
                        <p className="text-sm text-[rgba(255,255,255,0.8)]">
                          {flag.concern}
                        </p>
                      </li>
                    ))}
                  </ul>
                </AnalysisCard>
              )}

              {/* Priority Action Items */}
              {analysis.priorityActions && analysis.priorityActions.length > 0 && (
                <AnalysisCard title="Priority Action Items" icon={ListChecks}>
                  <ol className="space-y-3">
                    {analysis.priorityActions.map((action, i) => (
                      <li key={i} className="flex items-start gap-4 text-sm text-[rgba(255,255,255,0.8)]">
                        <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[rgba(212,175,55,0.1)] border border-[rgba(212,175,55,0.2)] text-gold text-xs font-mono font-bold flex-shrink-0">
                          {i + 1}
                        </span>
                        <span className="pt-1 leading-relaxed">{action}</span>
                      </li>
                    ))}
                  </ol>
                </AnalysisCard>
              )}
            </div>
          )}

          {/* Transcript */}
          {call.transcript_text && (
            <TranscriptViewer transcript={call.transcript_text} />
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-6 mt-2 border-t border-[rgba(255,255,255,0.06)]">
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
