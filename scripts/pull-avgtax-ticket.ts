import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { writeFileSync, mkdirSync } from "fs";
config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const TICKET_ID = "2afa5a9b-c9e3-4bb7-9ac3-202423c9793f";

(async () => {
  // Full ticket row — maybe attachment is a column
  const { data: t } = await admin.from("support_tickets").select("*").eq("id", TICKET_ID).single();
  console.log("=== FULL TICKET ROW KEYS ===");
  console.log(Object.keys(t ?? {}).join(", "));
  console.log(JSON.stringify(t, null, 2));

  // Try a few attachment table names
  for (const tbl of ["support_ticket_attachments", "ticket_attachments", "support_attachments"]) {
    const { data, error } = await admin.from(tbl).select("*").eq("ticket_id", TICKET_ID);
    console.log(`\n[${tbl}] error=${error?.message ?? "none"} rows=${JSON.stringify(data)}`);
  }

  // List storage buckets + any files under this ticket id
  const { data: buckets } = await admin.storage.listBuckets();
  console.log("\n=== BUCKETS ===", buckets?.map((b) => b.name).join(", "));
  for (const b of buckets ?? []) {
    for (const prefix of ["", TICKET_ID, `tickets/${TICKET_ID}`, `support/${TICKET_ID}`]) {
      const { data: files } = await admin.storage.from(b.name).list(prefix, { limit: 100 });
      if (files && files.length) console.log(`  bucket=${b.name} prefix="${prefix}" -> ${files.map((f) => f.name).join(", ")}`);
    }
  }
})();
