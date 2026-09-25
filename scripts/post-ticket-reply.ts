// Post an admin reply on a support ticket the same way the app's comment route does:
// insert the comment, email the advisor, update the ticket status.
// Usage: npx tsx scripts/post-ticket-reply.ts <ticketId> <status:resolved|waiting_on_user|in_progress> <bodyFile>
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";
import { sendTicketReplyEmail } from "../lib/notifications/email";
config({ path: resolve(process.cwd(), ".env.local") });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const AUTHOR_EMAIL = "hamza@hexonasystems.com";
const [ticketId, status, bodyFile] = process.argv.slice(2);
if (!ticketId || !status || !bodyFile) { console.error("usage: <ticketId> <status> <bodyFile>"); process.exit(1); }
if (!["resolved", "waiting_on_user", "in_progress"].includes(status)) { console.error("bad status"); process.exit(1); }
const body = readFileSync(bodyFile, "utf8").trim();

(async () => {
  const { data: me } = await admin.from("profiles").select("id").eq("email", AUTHOR_EMAIL).single();
  const { data: t, error } = await admin.from("support_tickets").select("id, subject, status, user_id").eq("id", ticketId).single();
  if (error || !t) throw error ?? new Error("ticket not found");

  const { error: cErr } = await admin.from("support_ticket_comments").insert({ ticket_id: t.id, user_id: me!.id, body, is_internal: false });
  if (cErr) throw cErr;

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { status, updated_at: now, resolved_at: status === "resolved" ? now : null };
  const { error: sErr } = await admin.from("support_tickets").update(update).eq("id", t.id);
  if (sErr) throw sErr;
  if (status !== t.status) {
    await admin.from("support_ticket_events").insert({ ticket_id: t.id, user_id: me!.id, event_type: "status_change", old_value: t.status, new_value: status });
  }

  // NOTE: sendTicketReplyEmail silently no-ops when RESEND_API_KEY is absent
  // (it is only set on Vercel), so "attempted" here does not mean delivered.
  let emailed = "skipped (no email on file)";
  const [{ data: prof }, { data: us }] = await Promise.all([
    admin.from("profiles").select("email").eq("id", t.user_id).maybeSingle(),
    admin.from("user_settings").select("first_name").eq("user_id", t.user_id).maybeSingle(),
  ]);
  if (prof?.email) {
    try { await sendTicketReplyEmail({ to: prof.email, firstName: us?.first_name ?? null, ticketId: t.id, ticketSubject: t.subject, replyBody: body }); emailed = process.env.RESEND_API_KEY ? `sent to ${prof.email}` : `NOT sent (no RESEND_API_KEY locally) — in-app only for ${prof.email}`; }
    catch (e) { emailed = `FAILED: ${(e as Error).message}`; }
  }
  console.log(`✅ "${t.subject}" — comment posted, status ${t.status} → ${status}, email ${emailed}`);
})();
