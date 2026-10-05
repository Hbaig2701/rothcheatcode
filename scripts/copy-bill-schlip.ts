import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv"; import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken:false, persistSession:false }});
const TARGET_USER_ID = "0c658494-76ff-4765-9733-1d50a1e0a7d1"; // hamza@hexonasystems.com
const COMMIT = process.argv[2] === "--commit";
(async()=>{
  // Find Greg Stoope
  const {data:greg}=await admin.from("profiles").select("id,email,full_name").or("full_name.ilike.%stoope%,email.ilike.%stoope%").limit(5);
  console.log("Greg matches:", JSON.stringify(greg));
  const gregId = greg?.[0]?.id;
  // Find Bill Schlip clients
  const {data:clients}=await admin.from("clients").select("id,name,user_id,qualified_account_value,blueprint_type").ilike("name","%schlip%");
  console.log("\nBill Schlip clients:", JSON.stringify((clients||[]).map(c=>({id:c.id,name:c.name,user_id:c.user_id,qav:c.qualified_account_value})),null,2));
  // Prefer the one owned by Greg
  const src = (clients||[]).find(c=>c.user_id===gregId) ?? (clients||[])[0];
  if(!src){ console.log("No Bill Schlip client found."); return; }
  console.log("\nSelected source:", src.id, "| owner:", src.user_id, "| owned by Greg?", src.user_id===gregId);

  const {data:full}=await admin.from("clients").select("*").eq("id",src.id).single();
  const payload:Record<string,unknown>={...full};
  delete payload.id; delete payload.created_at; delete payload.updated_at;
  payload.user_id = TARGET_USER_ID;
  if("parent_client_id" in payload) payload.parent_client_id = null;
  payload.name = `${(full as any).name} (Greg copy)`;
  console.log(`\nWould copy "${(full as any).name}" -> "${payload.name}" into hamza@hexonasystems.com`);
  if(!COMMIT){ console.log("[DRY RUN] re-run with --commit"); return; }
  const {data:ins,error}=await admin.from("clients").insert(payload).select("id,name,user_id,qualified_account_value").single();
  if(error){ console.log("Insert failed:", error.message); return; }
  console.log("\n✅ Copied:", JSON.stringify(ins,null,2));
})();
