/**
 * Internal-team email filter for admin analytics.
 *
 * Used across the admin dashboard endpoints (revenue, advisors, stats,
 * AI chat usage, etc.) to exclude internal Vroom team members from
 * advisor-facing metrics. Without this filter, internal accounts dragged
 * MRR / signup / churn / spend numbers in misleading directions.
 *
 * Add a domain or specific email here when a new internal account starts
 * showing up in the metrics. Domain matching is case-insensitive on the
 * part after the `@`.
 */

const INTERNAL_TEAM_DOMAINS = ["vroommediagroup.com"];

const INTERNAL_TEAM_EMAILS: string[] = [
  // One-off internal accounts that aren't on a team domain go here.
];

export function isInternalTeamEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  if (INTERNAL_TEAM_EMAILS.includes(lower)) return true;
  const at = lower.indexOf("@");
  if (at < 0) return false;
  const domain = lower.slice(at + 1);
  return INTERNAL_TEAM_DOMAINS.includes(domain);
}

/**
 * Fetch the profile IDs of all internal team members so they can be
 * excluded server-side in admin analytics queries that filter by
 * `.not('user_id', 'in', ...)`. The stats / activity / today endpoints
 * use this pattern to scope per-table count queries.
 *
 * Pass an admin Supabase client (NOT the user-scoped one) so RLS doesn't
 * scope the fetch. Returns an empty array if nothing matches — callers
 * should guard their .not() calls accordingly (an empty IN list errors
 * out in Postgres).
 *
 * Uses .or() with email.ilike patterns per domain plus a flat list of
 * specific emails. Supabase doesn't support a single .ilike across an
 * email-domain LIKE pattern in .not(), so we resolve to IDs first.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchInternalTeamProfileIds(admin: any): Promise<string[]> {
  const orParts: string[] = [];
  for (const domain of INTERNAL_TEAM_DOMAINS) {
    orParts.push(`email.ilike.%@${domain}`);
  }
  for (const email of INTERNAL_TEAM_EMAILS) {
    orParts.push(`email.eq.${email}`);
  }
  if (orParts.length === 0) return [];
  const { data } = await admin
    .from("profiles")
    .select("id, email")
    .or(orParts.join(","));
  return ((data ?? []) as Array<{ id: string; email: string | null }>)
    .filter((p) => isInternalTeamEmail(p.email))
    .map((p) => p.id);
}
