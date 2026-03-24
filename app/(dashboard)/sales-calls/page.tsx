'use client';

import { useState } from 'react';
import { Loader2, Plus, Mic } from 'lucide-react';
import { useSalesCalls } from '@/lib/queries/sales-calls';
import { CallsList } from '@/components/sales-calls/calls-list';
import { CallsEmptyState } from '@/components/sales-calls/calls-empty-state';
import { UploadModal } from '@/components/sales-calls/upload-modal';

export default function SalesCallsPage() {
  const { data, isLoading, isError, error } = useSalesCalls();
  const [uploadOpen, setUploadOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="p-9">
        <div className="flex items-center justify-between mb-9">
          <div>
            <h1 className="font-display text-[30px] font-normal text-white">
              Sales Call Analyzer
            </h1>
            <p className="text-base text-[rgba(255,255,255,0.4)] mt-1.5">Loading...</p>
          </div>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-9">
        <div className="mb-9">
          <h1 className="font-display text-[30px] font-normal text-white">
            Sales Call Analyzer
          </h1>
        </div>
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-sm text-red-400 mb-2">Failed to load sales calls</p>
          <p className="text-xs text-[rgba(255,255,255,0.4)]">{error.message}</p>
        </div>
      </div>
    );
  }

  const calls = data?.calls ?? [];
  const hasCalls = calls.length > 0;

  return (
    <div className="p-9">
      <div className="flex items-center justify-between mb-9">
        <div>
          <h1 className="font-display text-[30px] font-normal text-white">
            Sales Call Analyzer
          </h1>
          <p className="text-base text-[rgba(255,255,255,0.4)] mt-1.5">
            {hasCalls ? `${data?.total || 0} call${(data?.total || 0) !== 1 ? 's' : ''} analyzed` : 'AI-powered coaching for your sales calls'}
          </p>
        </div>
        {hasCalls && (
          <button
            onClick={() => setUploadOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-[#0c0c0c] bg-gold rounded-[10px] hover:bg-[rgba(212,175,55,0.9)] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Upload Call
          </button>
        )}
      </div>

      {hasCalls ? (
        <CallsList calls={calls} />
      ) : (
        <CallsEmptyState onUpload={() => setUploadOpen(true)} />
      )}

      <UploadModal open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  );
}
