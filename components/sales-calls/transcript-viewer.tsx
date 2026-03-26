'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check, FileText } from 'lucide-react';

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
    <div className="rounded-[14px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.025)]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full px-7 py-5 text-left hover:bg-[rgba(255,255,255,0.02)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[10px] flex items-center justify-center bg-[rgba(212,175,55,0.08)] border border-[rgba(212,175,55,0.2)]">
            <FileText className="w-4 h-4 text-gold" />
          </div>
          <span className="text-xs font-medium uppercase tracking-[1.5px] text-[rgba(255,255,255,0.65)]">
            Transcript
          </span>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-[rgba(255,255,255,0.3)]" />
          ) : (
            <ChevronRight className="h-4 w-4 text-[rgba(255,255,255,0.3)]" />
          )}
        </div>
        {expanded && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[rgba(255,255,255,0.6)] rounded-[8px] border border-[rgba(255,255,255,0.1)] hover:border-[rgba(212,175,55,0.3)] hover:text-gold transition-all"
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
        <div className="px-7 pb-7">
          <div className="max-h-96 overflow-y-auto rounded-[10px] bg-[rgba(0,0,0,0.3)] p-4">
            <pre className="text-sm text-[rgba(255,255,255,0.7)] whitespace-pre-wrap font-sans leading-relaxed">
              {transcript}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
