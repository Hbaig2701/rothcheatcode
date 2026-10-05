import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { writeFileSync, mkdirSync } from "fs";
config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

(async () => {
  const { data: greg } = await admin.from("profiles").select("id").eq("email", "greg@bluestarstrategy.com").single();
  const { data: tickets } = await admin
    .from("support_tickets")
    .select("*")
    .eq("user_id", greg!.id)
    .order("created_at", { ascending: false });

  mkdirSync("/tmp/greg-tickets", { recursive: true });
  console.log(`=== GREG TICKETS (${tickets?.length ?? 0}) ===\n`);
  for (const t of tickets ?? []) {
    console.log(`──────────────────────────────────────────────`);
    console.log(`[${t.status.toUpperCase()}] ${t.subject}`);
    console.log(`  id=${t.id} client=${t.client_id ?? "—"} created=${t.created_at} category=${t.category} sev=${t.severity}`);
    console.log(`  DESC: ${t.description}`);

    const { data: comments } = await admin.from("support_ticket_comments").select("user_id, body, is_internal, created_at").eq("ticket_id", t.id).order("created_at", { ascending: true });
    for (const c of comments ?? []) {
      const who = c.user_id === greg!.id ? "GREG" : "US";
      console.log(`   ↳ [${who}${c.is_internal ? "/internal" : ""} ${c.created_at}]: ${c.body.replace(/\n/g, " ")}`);
    }

    const { data: atts } = await admin.from("support_ticket_attachments").select("file_path, file_name").eq("ticket_id", t.id);
    for (const a of atts ?? []) {
      const { data: f } = await admin.storage.from("support-attachments").download(a.file_path);
      if (!f) continue;
      const safe = `${t.id.slice(0, 8)}__${a.file_name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      writeFileSync(`/tmp/greg-tickets/${safe}`, Buffer.from(await f.arrayBuffer()));
      console.log(`   📎 ${a.file_name} -> /tmp/greg-tickets/${safe}`);
    }
    console.log("");
  }
})();
