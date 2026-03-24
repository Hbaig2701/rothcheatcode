'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';

interface TranscriptViewerProps {
  transcript: string;
}

export function TranscriptViewer({ transcript }: TranscriptViewerProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full px-5 py-4 text-left hover:bg-[rgba(255,255,255,0.02)] transition-colors"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-[rgba(255,255,255,0.5)]" />
          ) : (
            <ChevronRight className="h-4 w-4 text-[rgba(255,255,255,0.5)]" />
          )}
          <span className="text-sm font-semibold text-white uppercase tracking-wider">
            Transcript
          </span>
        </div>
        {expanded && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-[rgba(255,255,255,0.6)] rounded-md border border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.05)] transition-colors"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-green-400" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy
              </>
            )}
          </button>
        )}
      </button>

      {expanded && (
        <div className="px-5 pb-5">
          <div className="max-h-96 overflow-y-auto rounded-lg bg-[rgba(0,0,0,0.3)] p-4">
            <pre className="text-sm text-[rgba(255,255,255,0.7)] whitespace-pre-wrap font-sans leading-relaxed">
              {transcript}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
