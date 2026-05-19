/**
 * Cross-instance metrics cache.
 *
 * Backed by admin_metrics_cache in Supabase so all Vercel instances see
 * the same cached payload. Without this, in-memory caches were
 * per-instance — refresh would land on a different instance, miss the
 * cache, rebuild from Stripe with possibly-different pagination results,
 * and the displayed numbers fluctuated.
 *
 * Usage pattern:
 *
 *   const cached = await readMetricsCache<MyPayload>(admin, 'revenue');
 *   if (cached && Date.now() - new Date(cached.computed_at).getTime() < TTL) {
 *     return Response.json({ ...cached.payload, _cached: true });
 *   }
 *
 *   const payload = await rebuildExpensively();
 *   await writeMetricsCache(admin, 'revenue', payload);
 *   return Response.json(payload);
 *
 * On rebuild failure, leave the old cache row in place — partial data is
 * worse than slightly-stale data for admin dashboards.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { SupabaseClient } from "@supabase/supabase-js";

export interface CachedRow<T> {
  payload: T;
  computed_at: string;
}

export async function readMetricsCache<T>(
  admin: SupabaseClient,
  key: string,
): Promise<CachedRow<T> | null> {
  const { data } = await admin
    .from("admin_metrics_cache")
    .select("payload, computed_at")
    .eq("key", key)
    .maybeSingle();
  if (!data) return null;
  return {
    payload: data.payload as T,
    computed_at: data.computed_at as string,
  };
}

export async function writeMetricsCache<T>(
  admin: SupabaseClient,
  key: string,
  payload: T,
): Promise<void> {
  // Upsert by primary key. computed_at defaults to now() if not provided,
  // but we set it explicitly so the value is consistent regardless of
  // clock skew between the DB and the writing instance.
  await admin
    .from("admin_metrics_cache")
    .upsert({ key, payload, computed_at: new Date().toISOString() });
}

/**
 * Helper: returns true if the cached row is still fresh enough to serve.
 */
export function isFresh(cached: CachedRow<unknown> | null, ttlMs: number): boolean {
  if (!cached) return false;
  const ageMs = Date.now() - new Date(cached.computed_at).getTime();
  return ageMs < ttlMs;
}
