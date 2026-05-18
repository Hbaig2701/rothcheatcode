/**
 * /api/chat/conversations/[id]
 *
 *   GET    — fetch one conversation + its messages (oldest → newest).
 *   PATCH  — rename or archive/unarchive.
 *   DELETE — hard delete (cascades messages).
 *
 * Ownership is enforced by RLS on chat_conversations, but the explicit check
 * here gives clean 404s instead of empty 200s.
 */
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: convo } = await supabase
    .from("chat_conversations")
    .select("id, user_id, title, last_message_at, archived, created_at")
    .eq("id", id)
    .single();
  if (!convo || convo.user_id !== user.id) {
    return new Response("Not found", { status: 404 });
  }

  const { data: messages, error } = await supabase
    .from("chat_messages")
    .select(
      "id, role, content, content_blocks, attachment_url, model, cost_usd, created_ticket_id, created_at"
    )
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });
  if (error) return new Response(error.message, { status: 500 });

  return Response.json({
    conversation: convo,
    messages: messages ?? [],
  });
}

interface PatchBody {
  title?: string;
  archived?: boolean;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.title === "string") {
    const trimmed = body.title.trim();
    if (trimmed.length > 0 && trimmed.length <= 200) patch.title = trimmed;
  }
  if (typeof body.archived === "boolean") patch.archived = body.archived;
  if (Object.keys(patch).length === 0) {
    return new Response("No valid fields to update", { status: 400 });
  }

  const { error } = await supabase
    .from("chat_conversations")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return new Response(error.message, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { error } = await supabase
    .from("chat_conversations")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return new Response(error.message, { status: 500 });
  return Response.json({ ok: true });
}
