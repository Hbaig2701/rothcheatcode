import { createClient } from "@supabase/supabase-js"; import { config } from "dotenv"; import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth:{autoRefreshToken:false,persistSession:false}});
(async()=>{
  const {data:tix,error}=await admin.from("support_tickets").select("id,subject,created_at,status,user_id").order("created_at",{ascending:false}).limit(15);
  if(error){ console.log("QUERY ERROR:", error.message); return; }
  console.log("=== 15 MOST RECENT TICKETS ===");
  for(const t of tix||[]) console.log(`  ${t.created_at}  [${t.status}]  ${t.subject?.slice(0,55)}`);
  // counts by day for last 30 days
  const {data:recent}=await admin.from("support_tickets").select("created_at").gte("created_at","2026-06-06").order("created_at",{ascending:false});
  const byDay:Record<string,number>={};
  for(const r of recent||[]){ const d=r.created_at.slice(0,10); byDay[d]=(byDay[d]||0)+1; }
  console.log("\n=== TICKETS PER DAY (last 30d) ===");
  Object.entries(byDay).sort().forEach(([d,n])=>console.log(`  ${d}: ${n}`));
  const {count:total}=await admin.from("support_tickets").select("*",{count:"exact",head:true});
  console.log("\nTotal tickets ever:", total, "| last 30d:", recent?.length);
  // also check comments table is alive
  const {data:cmt}=await admin.from("support_ticket_comments").select("created_at").order("created_at",{ascending:false}).limit(1);
  console.log("Most recent comment:", cmt?.[0]?.created_at ?? "none");
})();
