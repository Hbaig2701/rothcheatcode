'use client';

/**
 * Soft reflection prompt at the end of each module. No scoring - the goal
 * is to give the advisor a moment to articulate the concept in their own
 * words (or a script they could use with a client). The textarea is
 * client-only so they can think out loud without it being persisted.
 *
 * As soon as the user types something, the parent module is marked
 * complete in localStorage (used to surface "Complete" badges on the
 * curriculum index). The marker fires once per session and is debounced
 * so a few keystrokes don't churn writes.
 */

import { useEffect, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { markComplete } from '@/lib/training/progress';
import { useModuleSlug } from './module-slug-context';

interface ReflectionPromptProps {
  question: string;
}

export function ReflectionPrompt({ question }: ReflectionPromptProps) {
  const [value, setValue] = useState('');
  const slug = useModuleSlug();

  useEffect(() => {
    if (!slug) return;
    if (value.trim().length === 0) return;
    // First substantive keystroke marks the module complete.
    const t = setTimeout(() => markComplete(slug), 400);
    return () => clearTimeout(t);
  }, [value, slug]);

  return (
    <div className="rounded-[14px] bg-bg-card border border-border-default p-6">
      <div className="flex items-start gap-3 mb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-accent border border-gold-border shrink-0">
          <Lightbulb className="h-4 w-4 text-gold" />
        </div>
        <div className="flex-1">
          <div className="text-xs uppercase tracking-[1.5px] text-text-dimmer mb-1">Quick check</div>
          <p className="text-sm font-medium text-foreground leading-relaxed">{question}</p>
        </div>
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        placeholder="Type your one-sentence answer (just for you - nothing is saved or sent)…"
        className="w-full rounded-[10px] border border-border-default bg-bg-input px-3 py-2.5 text-sm text-foreground placeholder:text-text-dimmer focus:outline-none focus:border-gold-border transition-colors resize-none"
      />
    </div>
  );
}
