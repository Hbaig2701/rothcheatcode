/**
 * POST /api/chat/feedback — advisor flagged a specific assistant message as
 * wrong/unhelpful via the thumbs-down button in the chat widget.
 *
 * We do two things in one request:
 *   1. Create a support ticket prefilled with the conversation transcript
 *      so the support team can see exactly what the bot said and what came
 *      before/after it. The ticket's user_id is the advisor's, so it shows
 *      up in their own support inbox as well as the admin queue.
 *   2. Annotate the chat_messages row with `created_ticket_id` so the
 *      chat bubble can render the same "Filed support ticket - view it →"
 *      affordance we use when the bot itself files one.
 *
 * Idempotent-ish: if the message already has a ticket attached (because
 * the advisor clicked twice or the bot already filed one), we return the
 * existing ticket id instead of creating a duplicate.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface FeedbackBody {
  message_id: string;
  // Optional free-text the advisor typed when clicking the button. If
  // empty, we still file the ticket with the transcript alone — getting
  // SOMETHING captured matters more than guilting the advisor into prose.
  note?: string;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: FeedbackBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messageId = body.message_id;
  if (!messageId || typeof messageId !== "string") {
    return NextResponse.json({ error: "message_id required" }, { status: 400 });
  }
  const note = (body.note ?? "").trim().slice(0, 2000);

  // Pull the flagged message + its conversation context. RLS scopes to the
  // owning advisor — if the message_id doesn't belong to this user, we get
  // no row back and bail with 404.
  const { data: msg } = await supabase
    .from("chat_messages")
    .select("id, role, content, conversation_id, created_at, created_ticket_id")
    .eq("id", messageId)
    .single();
  if (!msg) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }
  if (msg.role !== "assistant") {
    return NextResponse.json({ error: "Only assistant messages can be flagged" }, { status: 400 });
  }

  // Idempotency layer 1: if a ticket is already linked, return it. This is
  // the common case after refresh — the bubble would already be showing the
  // "View ticket" affordance, but the user may have refreshed twice and
  // clicked again before that rendered. Cheap deduplication.
  if (msg.created_ticket_id) {
    return NextResponse.json({ ticket_id: msg.created_ticket_id, deduped: true });
  }

  // Idempotency layer 2: same advisor, same message_id, recent (<60s) ticket
  // with our marker prefix. Catches the case where the previous request
  // SUCCEEDED on the ticket insert but FAILED on the chat_messages stamp
  // (admin client error, service-role env var missing, network blip). Without
  // this check, a retry would create a duplicate ticket every time.
  const sixtySecondsAgo = new Date(Date.now() - 60_000).toISOString();
  const { data: recentDupes } = await supabase
    .from("support_tickets")
    .select("id, created_at")
    .eq("user_id", user.id)
    .gte("created_at", sixtySecondsAgo)
    .like("description", `%chat_message_id:${messageId}%`)
    .limit(1);
  if (recentDupes && recentDupes.length > 0) {
    return NextResponse.json({ ticket_id: recentDupes[0].id, deduped: true });
  }

  // Pull the surrounding transcript — the 10 messages around this one,
  // ordered chronologically. Gives the support team enough to understand
  // the back-and-forth without dumping the whole conversation. RLS keeps
  // it scoped to this advisor's own messages.
  const { data: thread } = await supabase
    .from("chat_messages")
    .select("role, content, created_at")
    .eq("conversation_id", msg.conversation_id)
    .order("created_at", { ascending: true });

  const transcript = (thread ?? [])
    .filter((m) => m.role !== "tool" || (m.content ?? "").trim().length > 0)
    .map((m) => `[${m.role.toUpperCase()}] ${(m.content ?? "").trim()}`)
    .join("\n\n");

  const flaggedSnippet = (msg.content ?? "").trim().slice(0, 400);
  const subject = `Chat response flagged: "${flaggedSnippet.slice(0, 60)}${flaggedSnippet.length > 60 ? "..." : ""}"`;

  // Stable marker the idempotency lookup above grep-matches against. Don't
  // change the format without updating the .like() pattern.
  const idempotencyMarker = `chat_message_id:${messageId}`;
  const description =
    `[Advisor flagged a chat response via the thumbs-down button. ${idempotencyMarker}]\n\n` +
    (note ? `Advisor's note:\n${note}\n\n` : "") +
    `Flagged message (assistant, ${msg.created_at}):\n${msg.content}\n\n` +
    `Conversation transcript:\n${transcript}`;

  const { data: ticket, error: ticketError } = await supabase
    .from("support_tickets")
    .insert({
      user_id: user.id,
      subject,
      description,
      severity: "medium",
      category: "bug",
    })
    .select("id")
    .single();

  if (ticketError || !ticket) {
    console.error("[chat-feedback] ticket insert failed", ticketError?.message);
    return NextResponse.json({ error: "Failed to file feedback ticket" }, { status: 500 });
  }

  // Stamp the message with the ticket id so the chat bubble can render the
  // "Support ticket linked to this reply" affordance. chat_messages has NO
  // RLS UPDATE policy (intentional, immutable audit log), so we use the
  // admin client for this targeted single-column annotation. The advisor
  // owns the message (verified above via the user-scoped SELECT).
  //
  // If the stamp fails, we still return success — the ticket DID get
  // created, the advisor's button has shown "submitted" state, and the
  // idempotency lookup above will prevent a duplicate if they retry.
  // We log loudly so the admin can spot a misconfigured service role.
  try {
    const admin = createAdminClient();
    const { error: stampError } = await admin
      .from("chat_messages")
      .update({ created_ticket_id: ticket.id })
      .eq("id", messageId);
    if (stampError) {
      console.error("[chat-feedback] message stamp failed", {
        messageId,
        ticketId: ticket.id,
        error: stampError.message,
      });
    }
  } catch (err) {
    console.error("[chat-feedback] admin client unavailable", err);
  }

  return NextResponse.json({ ticket_id: ticket.id });
}
