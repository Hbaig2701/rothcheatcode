/**
 * GET /api/admin/ai-chat/conversations/[id] — read-only drill-down into one
 * conversation for the admin panel. Returns the conversation, its messages
 * (including tool rows + content_blocks for tool_use detail), and the
 * advisor's display name.
 */
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/requireAdmin";

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
  await requireAdmin(supabase, user);

  const admin = createAdminClient();

  const { data: convo, error: convoErr } = await admin
    .from("chat_conversations")
    .select("id, user_id, title, last_message_at, archived, created_at")
    .eq("id", id)
    .single();
  if (convoErr || !convo) return new Response("Not found", { status: 404 });

  const { data: messages, error: msgErr } = await admin
    .from("chat_messages")
    .select(
      "id, role, content, content_blocks, attachment_url, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, cost_usd, model, created_ticket_id, created_at"
    )
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });
  if (msgErr) return new Response(msgErr.message, { status: 500 });

  // Hydrate advisor display name.
  const { data: settings } = await admin
    .from("user_settings")
    .select("first_name, last_name")
    .eq("user_id", convo.user_id)
    .maybeSingle();
  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", convo.user_id)
    .maybeSingle();
  const advisorName =
    [settings?.first_name, settings?.last_name].filter(Boolean).join(" ") ||
    (profile?.email as string | undefined) ||
    "Advisor";

  return Response.json({
    conversation: convo,
    advisor: { id: convo.user_id, name: advisorName, email: profile?.email ?? null },
    messages: messages ?? [],
  });
}
