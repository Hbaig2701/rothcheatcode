/**
 * GET /api/admin/chat-flags — admin review queue for hallucination-guard hits.
 *
 * Returns flags landed in `chat_assistant_flags` by the post-response guard
 * (lib/chat/hallucination-guard.ts). Each flag carries the labels the guard
 * surfaced ("Claimed a Roth balance field…", "Referenced Section 10…") plus
 * enough context for an admin to judge whether it's a real bug or noise:
 *   - the offending assistant message text
 *   - the advisor's name + email
 *   - the last user turn so the conversational context is visible
 *
 * Filtering:
 *   ?status=unreviewed (default) — only flags where reviewed_at IS NULL
 *   ?status=all                  — everything, newest first
 *   ?status=reviewed             — already-handled
 *
 * Pagination: ?limit=50&before=<iso>  (cursor on created_at desc).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/requireAdmin";

export const dynamic = "force-dynamic";

interface FlagRow {
  id: string;
  message_id: string;
  conversation_id: string;
  user_id: string;
  flags: string[];
  reviewed_at: string | null;
  reviewed_by: string | null;
  reviewer_note: string | null;
  created_at: string;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  await requireAdmin(supabase, user);

  const admin = createAdminClient();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "unreviewed";
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") ?? 50)));
  const beforeIso = searchParams.get("before");

  // Build the flag query first; we'll hydrate referenced messages, conversations,
  // advisors, and reviewers in parallel after we know the page we're returning.
  let query = admin
    .from("chat_assistant_flags")
    .select("id, message_id, conversation_id, user_id, flags, reviewed_at, reviewed_by, reviewer_note, created_at")
    .order("created_at", { ascending: false })
    .limit(limit + 1); // +1 so we can derive nextCursor without a count query

  if (status === "unreviewed") query = query.is("reviewed_at", null);
  else if (status === "reviewed") query = query.not("reviewed_at", "is", null);
  if (beforeIso) query = query.lt("created_at", beforeIso);

  const { data: rawFlags, error: flagsErr } = await query;
  if (flagsErr) {
    console.error("[admin/chat-flags] list query failed", flagsErr.message);
    return NextResponse.json({ error: "Failed to load flags" }, { status: 500 });
  }

  const flagsAll = (rawFlags ?? []) as FlagRow[];
  const hasMore = flagsAll.length > limit;
  const flags = hasMore ? flagsAll.slice(0, limit) : flagsAll;
  const nextCursor = hasMore ? flags[flags.length - 1].created_at : null;

  // Quick-exit for an empty page so we don't fire a fan-out of empty IN queries.
  if (flags.length === 0) {
    return NextResponse.json({ flags: [], nextCursor: null, unreviewedCount: 0 });
  }

  const messageIds = [...new Set(flags.map((f) => f.message_id))];
  const conversationIds = [...new Set(flags.map((f) => f.conversation_id))];
  const advisorIds = [...new Set(flags.map((f) => f.user_id))];
  const reviewerIds = [...new Set(flags.map((f) => f.reviewed_by).filter((x): x is string => !!x))];

  // For each conversation, we want the LAST user message before each flagged
  // assistant turn — that's the question the bot was answering when it
  // tripped the guard. Single round trip pulls the assistant message rows
  // alongside, so the admin gets text excerpts without a second click.
  const [
    { data: messageRows },
    { data: conversationRows },
    { data: advisorRows },
    { data: reviewerRows },
    { count: unreviewedCount },
  ] = await Promise.all([
    admin
      .from("chat_messages")
      .select("id, role, content, conversation_id, created_at")
      .in("id", messageIds),
    admin
      .from("chat_conversations")
      .select("id, title, created_at")
      .in("id", conversationIds),
    admin
      .from("profiles")
      .select("id, email")
      .in("id", advisorIds),
    reviewerIds.length > 0
      ? admin.from("profiles").select("id, email").in("id", reviewerIds)
      : Promise.resolve({ data: [] }),
    admin
      .from("chat_assistant_flags")
      .select("id", { count: "exact", head: true })
      .is("reviewed_at", null),
  ]);

  // For "the prior user turn" lookup: pull the 5 messages immediately
  // BEFORE each flagged assistant message in the same conversation. We do
  // this in a single broader query and pick the right row per flag in JS.
  const flagCreatedAtByMsg = new Map(flags.map((f) => [f.message_id, f.created_at]));
  const { data: priorTurnRows } = await admin
    .from("chat_messages")
    .select("id, role, content, conversation_id, created_at")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false })
    .limit(conversationIds.length * 10);

  const advisorById = new Map((advisorRows ?? []).map((r) => [r.id, r]));
  const reviewerById = new Map((reviewerRows ?? []).map((r) => [r.id, r]));
  const messageById = new Map((messageRows ?? []).map((r) => [r.id, r]));
  const conversationById = new Map((conversationRows ?? []).map((r) => [r.id, r]));

  function priorUserMessage(flag: FlagRow): { content: string; created_at: string } | null {
    const flaggedMsg = messageById.get(flag.message_id);
    if (!flaggedMsg) return null;
    const candidates = (priorTurnRows ?? [])
      .filter(
        (m) =>
          m.conversation_id === flag.conversation_id &&
          m.role === "user" &&
          m.created_at < flaggedMsg.created_at,
      )
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    if (candidates.length === 0) return null;
    return { content: candidates[0].content, created_at: candidates[0].created_at };
  }

  const hydrated = flags.map((f) => {
    const flaggedMsg = messageById.get(f.message_id);
    const advisor = advisorById.get(f.user_id);
    const reviewer = f.reviewed_by ? reviewerById.get(f.reviewed_by) : null;
    return {
      id: f.id,
      created_at: f.created_at,
      reviewed_at: f.reviewed_at,
      reviewer: reviewer ? { id: reviewer.id, email: reviewer.email } : null,
      reviewer_note: f.reviewer_note,
      flags: f.flags,
      advisor: advisor
        ? { id: advisor.id, email: advisor.email }
        : { id: f.user_id, email: null },
      conversation: {
        id: f.conversation_id,
        title: conversationById.get(f.conversation_id)?.title ?? null,
      },
      flagged_message: flaggedMsg
        ? {
            id: flaggedMsg.id,
            content: flaggedMsg.content,
            created_at: flaggedMsg.created_at,
          }
        : null,
      prior_user_message: priorUserMessage(f),
    };
  });

  return NextResponse.json({
    flags: hydrated,
    nextCursor,
    unreviewedCount: unreviewedCount ?? 0,
  });
}
