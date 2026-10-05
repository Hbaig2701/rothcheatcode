import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

(async () => {
  const { data: greg } = await admin.from("profiles").select("id").eq("email", "greg@bluestarstrategy.com").single();
  const { data: tickets } = await admin
    .from("support_tickets")
    .select("*")
    .eq("user_id", greg!.id)
    .ilike("subject", "%SS%")
    .order("created_at", { ascending: false });

  // Prefer the one mentioning Story / SS
  const t = (tickets ?? []).find((x) => /story/i.test(x.subject) || /story/i.test(x.description ?? "")) ?? tickets?.[0];
  if (!t) {
    console.log("No matching ticket. All Greg tickets subjects:");
    const { data: all } = await admin.from("support_tickets").select("id, subject, created_at").eq("user_id", greg!.id).order("created_at", { ascending: false });
    console.log(JSON.stringify(all, null, 2));
    return;
  }
  console.log("=== TICKET ===");
  console.log(JSON.stringify(t, null, 2));

  // Pull comments/replies — try common table names
  for (const tbl of ["support_ticket_comments", "support_ticket_messages", "support_ticket_replies", "ticket_comments"]) {
    const { data, error } = await admin.from(tbl).select("*").eq("ticket_id", t.id).order("created_at", { ascending: true });
    if (!error) {
      console.log(`\n=== ${tbl} (${data?.length ?? 0}) ===`);
      console.log(JSON.stringify(data, null, 2));
    }
  }
})();
