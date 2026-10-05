import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Latest stored projection per client, without downloading the history.
 *
 * The projections table is append-only: every recompute (input edit, or a
 * PRODUCT_CONFIG_VERSION bump) inserts a new row and keeps the old ones, so
 * an active advisor accumulates ~20 rows per client. List endpoints used to
 * select every row — including the multi-year JSONB columns — and keep only
 * the newest per client in JS, which made the clients list / scenarios /
 * dashboard payloads grow without bound. Worse, PostgREST caps a response at
 * 1000 rows by default, so past that the oldest clients silently lost their
 * latest projection.
 *
 * This pages through the rows (newest first) selecting only `columns`, and
 * keeps the first row seen per client_id. Keep `columns` to scalar fields;
 * fetch JSONB year arrays separately by id (see fetchProjectionColumnsByIds).
 */

const PAGE_SIZE = 1000;
// .in() filters go in the query string — keep id lists to a safe URL length.
const IN_CHUNK = 100;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, "public", any>;

type ProjectionScope = { userIds: string[] } | { clientIds: string[] };

/** Scalar columns the clients list + scenarios endpoints need for the delta badge. */
export const DELTA_COLUMNS =
  "client_id, baseline_final_net_worth, blueprint_final_net_worth, gi_tax_free_wealth_created, baseline_final_traditional, blueprint_final_traditional, baseline_final_qlac_death_benefit, blueprint_final_qlac_death_benefit";

export interface DeltaProjectionRow {
  client_id: string;
  baseline_final_net_worth: number;
  blueprint_final_net_worth: number;
  gi_tax_free_wealth_created: number | null;
  baseline_final_traditional: number;
  blueprint_final_traditional: number;
  baseline_final_qlac_death_benefit: number | null;
  blueprint_final_qlac_death_benefit: number | null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function fetchLatestProjections<T extends { client_id: string }>(
  supabase: AnySupabase,
  scope: ProjectionScope,
  columns: string,
): Promise<Map<string, T>> {
  const latest = new Map<string, T>();
  const filters: Array<{ column: "user_id" | "client_id"; values: string[] }> =
    "userIds" in scope
      ? [{ column: "user_id", values: scope.userIds }]
      : chunk(scope.clientIds, IN_CHUNK).map((values) => ({ column: "client_id", values }));

  for (const { column, values } of filters) {
    if (values.length === 0) continue;
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("projections")
        .select(columns)
        .in(column, values)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const rows = (data ?? []) as unknown as T[];
      for (const row of rows) {
        if (!latest.has(row.client_id)) latest.set(row.client_id, row);
      }
      if (rows.length < PAGE_SIZE) break;
    }
  }
  return latest;
}

/** Fetch specific (typically JSONB) columns for a known set of projection ids. */
export async function fetchProjectionColumnsByIds<T extends { id: string }>(
  supabase: AnySupabase,
  ids: string[],
  columns: string,
): Promise<T[]> {
  const batches = await Promise.all(
    chunk(ids, IN_CHUNK).map(async (batch) => {
      const { data, error } = await supabase.from("projections").select(columns).in("id", batch);
      if (error) throw error;
      return (data ?? []) as unknown as T[];
    }),
  );
  return batches.flat();
}
