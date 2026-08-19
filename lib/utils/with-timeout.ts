/**
 * Race a promise against a deadline.
 *
 * Every Supabase call in the request path (middleware session refresh, the
 * login page's getUser) is a network hop to a third party. When Supabase
 * degrades, those calls don't fail — they HANG. Vercel then kills the
 * middleware at its own limit and the visitor gets a raw
 * `MIDDLEWARE_INVOCATION_TIMEOUT` 504 on every route, including the login
 * page, with no way to tell them what's happening.
 *
 * Bounding the call turns "the whole site is a gateway error" into "the page
 * renders and tells you auth is temporarily unavailable". (Supabase outage,
 * Aug 2026.)
 *
 * Note the underlying promise is NOT cancelled — fetch has no abort here —
 * it's simply no longer awaited. Any rejection is swallowed so an orphaned
 * promise can't surface as an unhandled rejection.
 */
export type TimeoutResult<T> = { ok: true; value: T } | { ok: false };

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number
): Promise<TimeoutResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const guarded = promise.then(
    (value): TimeoutResult<T> => ({ ok: true, value }),
    (): TimeoutResult<T> => ({ ok: false })
  );

  const deadline = new Promise<TimeoutResult<T>>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false }), ms);
  });

  try {
    return await Promise.race([guarded, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * How long any single Supabase auth call gets before we give up on it.
 * A healthy call returns in well under 500ms; 3s is generous headroom while
 * still landing far inside Vercel's middleware budget.
 */
export const SUPABASE_AUTH_TIMEOUT_MS = 3000;
