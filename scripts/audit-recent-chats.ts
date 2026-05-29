/**
 * Audit the last N AI chat conversations across all users.
 * Pulls each conversation's messages and prints them so we can review
 * helpfulness/accuracy/usefulness.
 *
 * Usage:
 *   npx tsx scripts/audit-recent-chats.ts [count]   # default 20
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const COUNT = parseInt(process.argv[2] ?? "20", 10);

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

interface MsgRow {
  id: string;
  conversation_id: string;
  user_id: string;
  role: string;
  content: string;
  content_blocks: unknown;
  created_at: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
}

(async () => {
  const { data: convs, error: convErr } = await admin
    .from("chat_conversations")
    .select("id, user_id, title, last_message_at, created_at")
    .order("last_message_at", { ascending: false })
    .limit(COUNT);
  if (convErr) {
    console.error("Failed to fetch conversations:", convErr.message);
    process.exit(1);
  }
  if (!convs || convs.length === 0) {
    console.log("No conversations found.");
    process.exit(0);
  }

  // Get user emails
  const { data: usersList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const userById = new Map<string, string>(
    (usersList?.users ?? []).map((u) => [u.id, u.email ?? ""])
  );

  for (let i = 0; i < convs.length; i++) {
    const c = convs[i];
    const email = userById.get(c.user_id) ?? c.user_id.slice(0, 8);
    console.log(`\n${"=".repeat(80)}`);
    console.log(
      `CHAT ${i + 1}/${convs.length} · ${c.title ?? "(untitled)"} · ${email} · ${c.last_message_at}`
    );
    console.log(`Conv ID: ${c.id}`);
    console.log("=".repeat(80));

    const { data: msgs } = await admin
      .from("chat_messages")
      .select("id, role, content, content_blocks, created_at, model, input_tokens, output_tokens")
      .eq("conversation_id", c.id)
      .order("created_at", { ascending: true });

    if (!msgs || msgs.length === 0) {
      console.log("(no messages)");
      continue;
    }
    for (const m of msgs as MsgRow[]) {
      const ts = new Date(m.created_at).toISOString().slice(11, 19);
      const tokens = m.output_tokens ? ` [${m.output_tokens}tok]` : "";
      console.log(`\n--- ${m.role.toUpperCase()} @ ${ts}${tokens} ---`);
      // Prefer text content; if content_blocks has rich content, fall back to that
      const content = (m.content ?? "").trim();
      if (content) {
        console.log(content);
      } else if (Array.isArray(m.content_blocks)) {
        for (const block of m.content_blocks as Array<Record<string, unknown>>) {
          const type = block.type as string;
          if (type === "text" && block.text) {
            console.log(block.text);
          } else if (type === "tool_use") {
            console.log(`[tool_use: ${block.name}] ${JSON.stringify(block.input).slice(0, 200)}`);
          } else if (type === "tool_result") {
            const r = typeof block.content === "string"
              ? block.content
              : JSON.stringify(block.content);
            console.log(`[tool_result] ${r.slice(0, 400)}`);
          }
        }
      } else {
        console.log("(empty)");
      }
    }
  }

  process.exit(0);
})();
