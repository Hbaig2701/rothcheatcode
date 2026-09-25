import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const SOURCE_CLIENT_ID = "cb7a54be-0098-4a87-b6da-e5b6b009a72c"; // Richard Goldstein (this ticket), owned by Jorge
const TARGET_USER_ID = "0c658494-76ff-4765-9733-1d50a1e0a7d1"; // hamza@hexonasystems.com
const DRY_RUN = process.argv[2] !== "--commit";

(async () => {
  const { data: src, error } = await admin.from("clients").select("*").eq("id", SOURCE_CLIENT_ID).single();
  if (error || !src) { console.error("Failed to load source:", error?.message); process.exit(1); }

  const payload: Record<string, unknown> = { ...src };
  delete payload.id; delete payload.created_at; delete payload.updated_at;
  payload.user_id = TARGET_USER_ID;
  if ("parent_client_id" in payload) payload.parent_client_id = null;
  payload.name = `${src.name} (Jorge ticket copy)`;

  console.log(`Source: "${src.name}"  IRA=$${(src.traditional_ira/100).toLocaleString()}  rate=${src.rate_of_return}%  bonus=${src.bonus_percent}%`);
  console.log(`Target: hamza@hexonasystems.com  New name: "${payload.name}"`);
  if (DRY_RUN) { console.log("\n[DRY RUN] Re-run with --commit to write."); return; }

  const { data: inserted, error: insErr } = await admin.from("clients").insert(payload).select("id, name, user_id, traditional_ira, rate_of_return, bonus_percent").single();
  if (insErr) { console.error("Insert failed:", insErr.message); process.exit(1); }
  console.log("\n✅ Copied to your account:");
  console.log(JSON.stringify(inserted, null, 2));
})();
