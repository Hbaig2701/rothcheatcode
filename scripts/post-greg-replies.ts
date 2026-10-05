import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const AUTHOR = "0c658494-76ff-4765-9733-1d50a1e0a7d1"; // hamza@hexonasystems.com (the "US" author on prior replies)

const replies: { ticket: string; body: string }[] = [
  {
    ticket: "5021fccc-61a3-4d11-a552-760eb6778d7d", // NEW RMD INPUT BOX BUG
    body: `Fixed and deployed. The "RMDs Handled Externally" checkbox now saves with the case — tick it, click Update Scenario, and it'll stay checked when you reopen Inputs (and the projection will recalculate with RMDs handled outside the annuity). Give it a refresh and confirm.`,
  },
  {
    ticket: "6d4cd8b7-00ad-4e24-8208-ddcc8693b611", // Can't Read ? Box
    body: `Fixed and deployed. All the "?" help pop-ups now render in the foreground, on top of the other boxes, everywhere they appear — not just the RMD one. Refresh and have a look.`,
  },
  {
    ticket: "b3f530c4-f0f0-4d0f-8664-6081cd66760e", // Tax Columns Question
    body: `Two things here. You can already drag columns into any order inside Adjust Columns — grab a selected column and drag it where you want. And we just changed the behavior so that when you add a column it drops in next to its related columns automatically — so adding "State Tax" now lands it right beside the Federal Tax columns instead of way out on the right. Refresh and re-add State Tax to see it.`,
  },
  {
    ticket: "832ed51c-ee63-44a9-a58b-4205b2c6a721", // Tax Calculation Question (53.6%)
    body: `Good question. The jump is the "gross-up" from paying the tax internally. When the conversion tax comes from the IRA, those tax dollars are themselves a withdrawal from the pre-tax IRA — so they get taxed too (tax on the tax). That pushes the all-in rate to roughly your marginal rate ÷ (1 − marginal rate): about 35% ÷ 65% ≈ 53–54%, which is the 53.6% you're seeing. When you pay the tax externally (from the brokerage), you're using already-taxed dollars, so there's no gross-up and the rate stays ~35%. Both numbers are correct — 53.6% is the true cost of funding the tax out of the IRA itself. We've also added a note on that screen, and relabeled the figure to "Avg All-In Rate (Fed + State)" so it's clearer.`,
  },
  {
    ticket: "2afa5a9b-c9e3-4bb7-9ac3-202423c9793f", // Why Avg Tax Rate 34.8%
    body: `Quick follow-up: we relabeled that figure to "Avg All-In Rate (Fed + State)" on the report so the federal-vs-federal+state distinction is clear up front. Let us know if that clears it up and we'll close this out.`,
  },
  {
    ticket: "67df4b11-99ea-4c0a-9ff3-c76b5359c6c8", // Tax Calculation Question ($148,418)
    body: `Quick follow-up: we relabeled that figure to "Avg All-In Rate (Fed + State)" on the report so the federal-vs-federal+state distinction is clear up front. Let us know if that clears it up and we'll close this out.`,
  },
];

(async () => {
  for (const r of replies) {
    const { data: t } = await admin.from("support_tickets").select("subject, status").eq("id", r.ticket).single();
    const { error: cErr } = await admin.from("support_ticket_comments").insert({
      ticket_id: r.ticket,
      user_id: AUTHOR,
      body: r.body,
      is_internal: false,
    });
    if (cErr) { console.log(`❌ comment failed [${r.ticket}]: ${cErr.message}`); continue; }
    const { error: sErr } = await admin.from("support_tickets").update({ status: "waiting_on_user", updated_at: new Date().toISOString() }).eq("id", r.ticket);
    console.log(`✅ "${t?.subject}" — comment posted, status ${t?.status} → waiting_on_user${sErr ? ` (status err: ${sErr.message})` : ""}`);
  }
})();
