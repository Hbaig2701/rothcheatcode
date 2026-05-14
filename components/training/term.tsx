'use client';

/**
 * Inline glossary tooltip. Wrap a phrase in `<Term name="rmd">RMDs</Term>`
 * and the phrase renders with a subtle dotted underline; hovering (or
 * focusing) it reveals the glossary entry as a popup.
 *
 * Definitions live in lib/training/glossary.ts so the same explanation
 * surfaces everywhere the term appears.
 */

import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { GLOSSARY, type GlossaryKey } from '@/lib/training/glossary';

interface TermProps {
  name: GlossaryKey;
  children: React.ReactNode;
}

export function Term({ name, children }: TermProps) {
  const def = GLOSSARY[name];
  // If the key is misspelled, fall back to plain text rather than crash.
  if (!def) return <>{children}</>;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            className="border-b border-dotted border-gold/60 cursor-help decoration-skip-ink-none"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent
        className="max-w-sm p-3.5 text-left bg-bg-card border border-gold-border text-foreground shadow-lg"
        side="top"
      >
        <div className="text-xs font-semibold text-gold mb-1.5 leading-tight">{def.title}</div>
        <p className="text-xs text-text-dim leading-relaxed">{def.body}</p>
      </TooltipContent>
    </Tooltip>
  );
}
