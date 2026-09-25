/**
 * Chat assistant eval harness (dev tool, not shipped to users).
 *
 * Replicates the production agent loop (system prompt + column glossary + the
 * real CHAT_TOOLS running against the real DB) so we can pose advisor questions
 * to the assistant OUT of the browser, watch its tool calls + answers, and catch
 * regressions. Uses a service-role Supabase client (RLS bypassed) so it can read
 * any client for testing.
 *
 * Run: npx tsx scripts/chat-eval.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { buildSystemPrompt } from "@/lib/chat/system-prompt";
import { CHAT_TOOLS, runTool } from "@/lib/chat/tools";
import { CHAT_MODEL_DEFAULT } from "@/lib/chat/anthropic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ask(clientId: string, clientName: string, userId: string, question: string, model = CHAT_MODEL_DEFAULT) {
  const ctx = { supabase: sb, userId, sideEffects: {} as { ticketId?: string } };
  const system = buildSystemPrompt();
  const pageContext = `## Page context (what the advisor is currently looking at)\nThe advisor is viewing client \`${clientName}\` (id: \`${clientId}\`). When they ask "why is X" without naming a client, assume they mean THIS client and call tools with this client_id.`;
  const systemBlocks = [...system.map((b) => ({ type: "text" as const, text: b.text })), { type: "text" as const, text: pageContext }];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [{ role: "user", content: question }];
  console.log(`\n${"=".repeat(90)}\nQ [${clientName}]: ${question}`);
  let toolCallCount = 0;
  for (let turn = 0; turn < 10; turn++) {
    const resp = await anthropic.messages.create({
      model,
      max_tokens: 1500,
      system: systemBlocks,
      tools: CHAT_TOOLS as unknown as Anthropic.Tool[],
      messages,
    });
    messages.push({ role: "assistant", content: resp.content });
    const toolUses = resp.content.filter((b) => b.type === "tool_use");
    for (const b of resp.content) if (b.type === "text" && b.text.trim()) console.log(`A: ${b.text.trim()}`);
    if (toolUses.length === 0) break;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = [];
    for (const tu of toolUses) {
      toolCallCount++;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await runTool((tu as any).name, (tu as any).input as Record<string, unknown>, ctx);
      console.log(`  ↳ tool ${(tu as any).name}(${JSON.stringify((tu as any).input)})${r.isError ? " [ERROR]" : ""}`);
      results.push({ type: "tool_result", tool_use_id: (tu as any).id, content: r.content, is_error: r.isError });
    }
    messages.push({ role: "user", content: results });
  }
  console.log(`  (tool calls: ${toolCallCount})`);
}

async function main() {
  // Resolve the advisor user_id from one of the test clients.
  const { data: c } = await sb.from("clients").select("user_id").eq("id", "efff1e92-8392-4f71-aa17-3bd3d078a5e1").single();
  const userId = c!.user_id as string;

  const MARGE = "efff1e92-8392-4f71-aa17-3bd3d078a5e1";
  const JOEL = "911f1b27-13e7-4690-b19f-9d2363015ca2"; // vesting-bonus, full_conversion, MFJ (HAS projection)
  const CORNELIS = "ad2c4f30-08c0-4873-a59f-47024f20b623"; // $1.3M, optimized, single (NO projection)

  void CORNELIS;
  // Verify direct-Roth-contribution safety caveat (was giving harmful "no income limits" advice):
  await ask(JOEL, "Joel Ward", userId, "my client wants to do direct Roth contributions of after-tax dollars each year instead of a conversion — how do I model that and what are the limits?");
  // One more adversarial numeric probe (was a fumble class): comparing two specific years.
  await ask(MARGE, "Marge Simpson", userId, "how much more tax does the strategy pay than the baseline in the first two years combined?");
}

main().catch((e) => { console.error(e); process.exit(1); });
