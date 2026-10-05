import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

(async () => {
  const { data: rows } = await admin.from("clients").select("*").ilike("name", "%bonadio%");
  if (!rows?.length) { console.log("No Bonadio found."); return; }
  const orig: any = rows[0];
  console.log(`Original: ${orig.name} id=${orig.id} user_id=${orig.user_id}`);

  // Inspect existing cached projections for the original (possible corrupt-cache culprit)
  const { data: projs } = await admin.from("projections").select("id,created_at,input_hash,config_version").eq("client_id", orig.id);
  console.log(`Cached projections for original: ${projs?.length ?? 0}`);
  for (const p of projs ?? []) console.log(`  proj id=${(p as any).id} hash=${(p as any).input_hash?.slice(0,8)} v=${(p as any).config_version} created=${(p as any).created_at}`);

  // Build the duplicate: copy every field, drop id/timestamps, rename.
  const copy: any = { ...orig };
  delete copy.id;
  delete copy.created_at;
  delete copy.updated_at;
  copy.name = `${orig.name} (Copy)`;

  const { data: inserted, error } = await admin.from("clients").insert(copy).select().single();
  if (error) { console.error("INSERT FAILED:", error); return; }
  console.log(`\n✅ Duplicate created: "${inserted.name}" id=${inserted.id} user_id=${inserted.user_id}`);
})();
