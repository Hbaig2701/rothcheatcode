'use client';

/**
 * Threads the current module slug down through the body tree so the
 * reflection prompt can mark its own module complete without each of
 * the eight module body components having to forward a prop. The slug
 * is set once at the top of the [slug] page and consumed by any
 * descendant client component that needs it.
 */

import { createContext, useContext } from 'react';

const ModuleSlugContext = createContext<string | null>(null);

export function ModuleSlugProvider({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  return <ModuleSlugContext.Provider value={slug}>{children}</ModuleSlugContext.Provider>;
}

export function useModuleSlug(): string | null {
  return useContext(ModuleSlugContext);
}
