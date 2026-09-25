import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const SOURCE_CLIENT_ID = "02ab51ae-9a2f-4200-937c-87f508fa6fdd"; // Dr. Michael Policar (from Greg 2026-06-04), owned by Hamza
const TARGET_USER_ID = "689a6e80-c359-4310-988b-f1e2a988cb7b"; // greg@bluestarstrategy.com
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

  // Copy exactly as-is; only re-own and drop identity/audit/lineage columns.
  const payload: Record<string, unknown> = { ...src };
  delete payload.id;
  delete payload.created_at;
  delete payload.updated_at;
  payload.user_id = TARGET_USER_ID;
  // parent_client_id would point at a client in Hamza's account — null it to avoid a dangling cross-account ref.
  payload.parent_client_id = null;

  console.log(`Source: "${src.name}"  custom_product_id=${src.custom_product_id}`);
  console.log(`Target user: ${TARGET_USER_ID} (greg@bluestarstrategy.com)`);

  if (DRY_RUN) {
    console.log("\n[DRY RUN] Would insert this client. Re-run with --commit to write.");
    console.log(JSON.stringify(payload, null, 2).slice(0, 800) + "\n...");
    return;
  }

  const { data: inserted, error: insErr } = await admin
    .from("clients")
    .insert(payload)
    .select("id, name, user_id, custom_product_id, created_at")
    .single();
  if (insErr) {
    console.error("Insert failed:", insErr.message);
    process.exit(1);
  }
  console.log("\n✅ Copied. New client:");
  console.log(JSON.stringify(inserted, null, 2));
})();
