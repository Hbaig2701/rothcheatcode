'use client';

import { Mic, Plus } from 'lucide-react';

interface CallsEmptyStateProps {
  onUpload: () => void;
}

export function CallsEmptyState({ onUpload }: CallsEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.02)] px-8 py-20">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(212,175,55,0.1)] mb-5">
        <Mic className="h-7 w-7 text-gold" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">No sales calls yet</h3>
      <p className="text-sm text-[rgba(255,255,255,0.5)] text-center max-w-md mb-6">
        Upload a recording or paste a transcript to get AI-powered coaching feedback on your sales calls.
      </p>
      <button
        onClick={onUpload}
        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-[#0c0c0c] bg-gold rounded-[10px] hover:bg-[rgba(212,175,55,0.9)] transition-colors"
      >
        <Plus className="h-4 w-4" />
        Analyze your first call
      </button>
    </div>
  );
}
