'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScoreBadge } from './score-badge';
import { useDeleteSalesCall } from '@/lib/queries/sales-calls';
import type { SalesCall } from '@/lib/types/sales-call';

interface CallsListProps {
  calls: SalesCall[];
}

export function CallsList({ calls }: CallsListProps) {
  const router = useRouter();
  const deleteMutation = useDeleteSalesCall();
  const [deleteTarget, setDeleteTarget] = useState<SalesCall | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // Error handled by mutation
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const StatusIndicator = ({ status }: { status: SalesCall['status'] }) => {
    switch (status) {
      case 'complete':
        return <CheckCircle2 className="h-4 w-4 text-green-400" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-400" />;
      case 'uploading':
      case 'transcribing':
      case 'analyzing':
        return <Loader2 className="h-4 w-4 text-gold animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-text-dimmer" />;
    }
  };

  const statusLabel = (status: SalesCall['status']) => {
    switch (status) {
      case 'complete': return 'Complete';
      case 'failed': return 'Failed';
      case 'uploading': return 'Uploading...';
      case 'transcribing': return 'Transcribing...';
      case 'analyzing': return 'Analyzing...';
      default: return status;
    }
  };

  return (
    <>
      <div className="space-y-2">
        {calls.map((call) => (
          <div
            key={call.id}
            onClick={() => router.push(`/sales-calls/${call.id}`)}
            className="flex items-center justify-between rounded-xl border border-border-default bg-bg-card px-5 py-4 cursor-pointer hover:bg-bg-card-hover hover:border-border-default transition-colors"
          >
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <StatusIndicator status={call.status} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {call.title || 'Untitled Call'}
                </p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-text-dimmer">
                    {formatDate(call.call_date)}
                  </span>
                  {call.duration_seconds && (
                    <span className="text-xs text-text-dimmer">
                      {formatDuration(call.duration_seconds)}
                    </span>
                  )}
                  {call.status !== 'complete' && (
                    <span className="text-xs text-text-dimmer">
                      {statusLabel(call.status)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 ml-4">
              {call.overall_score !== null && call.status === 'complete' && (
                <ScoreBadge score={call.overall_score} />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(call);
                }}
                className="p-1.5 rounded-md hover:bg-secondary text-text-dimmer hover:text-red-400 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Sales Call</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.title || 'Untitled Call'}&quot;?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
