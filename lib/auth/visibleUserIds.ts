import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The set of user_ids whose clients (and projections) the viewer is entitled
 * to read/write through `/api/clients/...` endpoints. Always includes the
 * viewer themself; if they're a team member, also includes the team owner.
 *
 * NOT used for admin support-centre lookups — those bypass this and rely on
 * the dedicated "Admins can view all clients" RLS policy directly. Mixing
 * the two paths is what caused the Sharon Veasie leak (admins seeing other
 * advisors' clients on their own dashboard).
 */
export async function getVisibleUserIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "public", any>,
  viewerUserId: string,
): Promise<string[]> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("team_owner_id")
    .eq("id", viewerUserId)
    .single();
  const ids = [viewerUserId];
  if (profile?.team_owner_id && profile.team_owner_id !== viewerUserId) {
    ids.push(profile.team_owner_id as string);
  }
  return ids;
}
