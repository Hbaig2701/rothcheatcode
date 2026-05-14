'use client';

/**
 * Small client-side badge shown next to each module on the curriculum
 * index — empty when nothing's happened yet, "Viewed" once the advisor
 * has opened the module, "Complete" once they've engaged with the
 * reflection prompt.
 */

import { useEffect, useState } from 'react';
import { Check, Eye } from 'lucide-react';
import { getModuleProgress } from '@/lib/training/progress';

export function ModuleStatusBadge({ slug }: { slug: string }) {
  const [state, setState] = useState<'none' | 'viewed' | 'complete'>('none');

  useEffect(() => {
    const p = getModuleProgress(slug);
    if (p.complete) setState('complete');
    else if (p.viewed) setState('viewed');
    else setState('none');
  }, [slug]);

  if (state === 'complete') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-gold">
        <Check className="h-2.5 w-2.5" />
        Complete
      </span>
    );
  }
  if (state === 'viewed') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-text-dim">
        <Eye className="h-2.5 w-2.5" />
        Viewed
      </span>
    );
  }
  return null;
}
