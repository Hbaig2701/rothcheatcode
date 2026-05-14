/**
 * Per-user progress tracking for the Roth Theory curriculum.
 *
 * localStorage-only — these are advisor-facing learning signals, not
 * something we need server-side persistence for. Reset is one cleared
 * cache away, which is fine: the modules are short and re-doable.
 *
 * Two states per module:
 *   - viewed   — the advisor opened the module page
 *   - complete — the advisor typed something into the reflection prompt
 *                (the soft signal that they engaged with the material,
 *                not just scrolled past it)
 */

const STORAGE_KEY = 'retex_training_progress_v1';

export interface ModuleProgress {
  viewed: boolean;
  complete: boolean;
  viewedAt?: string;   // ISO timestamp
  completeAt?: string; // ISO timestamp
}

export type AllProgress = Record<string, ModuleProgress>;

function safeRead(): AllProgress {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as AllProgress;
    return {};
  } catch {
    return {};
  }
}

function safeWrite(p: AllProgress): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // Quota exhausted or storage disabled — non-fatal, progress just
    // won't persist across reloads. Acceptable for learning state.
  }
}

export function getAllProgress(): AllProgress {
  return safeRead();
}

export function getModuleProgress(slug: string): ModuleProgress {
  const all = safeRead();
  return all[slug] ?? { viewed: false, complete: false };
}

export function markViewed(slug: string): void {
  const all = safeRead();
  const existing = all[slug];
  if (existing?.viewed) return; // already recorded — don't overwrite the timestamp
  all[slug] = {
    ...existing,
    viewed: true,
    complete: existing?.complete ?? false,
    viewedAt: new Date().toISOString(),
  };
  safeWrite(all);
}

export function markComplete(slug: string): void {
  const all = safeRead();
  const existing = all[slug];
  if (existing?.complete) return;
  all[slug] = {
    ...existing,
    viewed: existing?.viewed ?? true,
    complete: true,
    completeAt: new Date().toISOString(),
  };
  safeWrite(all);
}

export function summarize(allSlugs: string[], progress: AllProgress = safeRead()): {
  viewedCount: number;
  completeCount: number;
  total: number;
} {
  let viewedCount = 0;
  let completeCount = 0;
  for (const slug of allSlugs) {
    const p = progress[slug];
    if (p?.viewed) viewedCount++;
    if (p?.complete) completeCount++;
  }
  return { viewedCount, completeCount, total: allSlugs.length };
}
