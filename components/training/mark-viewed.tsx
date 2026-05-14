'use client';

/**
 * Client-side helper that marks a module as viewed on mount. Drop into
 * any module page server component - has no visual output, just touches
 * localStorage so the curriculum index can show a "viewed" badge next
 * time the advisor visits it.
 */

import { useEffect } from 'react';
import { markViewed } from '@/lib/training/progress';

export function MarkViewed({ slug }: { slug: string }) {
  useEffect(() => {
    markViewed(slug);
  }, [slug]);
  return null;
}
