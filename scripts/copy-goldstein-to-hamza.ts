import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const SOURCE_CLIENT_ID = "a41159c8-f149-4cbe-be8d-65cde92dd8ca"; // Richard Goldstein, owned by Jorge L. Tola
const TARGET_USER_ID = "0c658494-76ff-4765-9733-1d50a1e0a7d1"; // hamza@hexonasystems.com (admin)
const DRY_RUN = process.argv[2] !== "--commit";

(async () => {
  const { data: src, error } = await admin
    .from("clients")
    .select("*")
    .eq("id", SOURCE_CLIENT_ID)
    .single();
  if (error || !src) {
    console.error("Failed to load source client:", error?.message);
    process.exit(1);
  }

  // Copy exactly as-is (INCLUDING the Section 8 withdrawals — that's the point,
  // so the issue is reproducible). Only re-own and drop identity/audit/lineage.
  const payload: Record<string, unknown> = { ...src };
  delete payload.id;
  delete payload.created_at;
  delete payload.updated_at;
  payload.user_id = TARGET_USER_ID;
  if ("parent_client_id" in payload) payload.parent_client_id = null;
  payload.name = `${src.name} (Jorge copy)`;

  console.log(`Source: "${src.name}"  IRA=${src.traditional_ira}  withdrawals=${(src.withdrawals ?? []).length} entries`);
  console.log(`Target user: ${TARGET_USER_ID} (hamza@hexonasystems.com)`);
  console.log(`New name: "${payload.name}"`);

  if (DRY_RUN) {
    console.log("\n[DRY RUN] Would insert. Re-run with --commit to write.");
    return;
  }

  const { data: inserted, error: insErr } = await admin
    .from("clients")
    .insert(payload)
    .select("id, name, user_id, traditional_ira, created_at")
    .single();
  if (insErr) {
    console.error("Insert failed:", insErr.message);
    process.exit(1);
  }
  console.log("\n✅ Copied. New client:");
  console.log(JSON.stringify(inserted, null, 2));
})();