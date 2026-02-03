import { createClient } from "@supabase/supabase-js";

/**
 * Admin client using service role key for privileged operations.
 * ONLY use server-side in API routes (e.g., deleting a user account).
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
