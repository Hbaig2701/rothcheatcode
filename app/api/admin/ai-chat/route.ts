/**
 * GET /api/admin/ai-chat — analytics for the AI chat feature.
 *
 * Returns:
 *   - totals: message count, cost, conversation count (all-time + last 30d)
 *   - daily: per-day cost + message count for last 30 days
 *   - perAdvisor: leaderboard of advisor usage (msgs + cost + last activity)
 *   - recentConversations: latest 50 conversations across all advisors
 *
 * Admin-only — guarded by requireAdmin. RLS already allows admin reads on
 * chat_messages and chat_conversations, but the explicit role check keeps
 * non-admins from hitting this endpoint at all.
 */
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/requireAdmin";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  await requireAdmin(supabase, user);

  // Admin client bypasses RLS so the analytics queries see every advisor's
  // data regardless of which advisor is logged in.
  const admin = createAdminClient();

  // 30-day cutoff.
  const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  // 1. Totals — all-time + last-30-day. We aggregate cost in JS rather than
  //    with a Postgres SUM() because Supabase JS doesn't expose aggregate
  //    queries cleanly, and the data volume at expected scale is small.
  const [
    { count: totalConversations },
    { count: totalMessages },
    { count: last30Conversations },
    { count: last30Messages },
    { data: costRows },
  ] = await Promise.all([
    admin.from("chat_conversations").select("id", { count: "exact", head: true }),
    admin.from("chat_messages").select("id", { count: "exact", head: true }),
    admin
      .from("chat_conversations")
      .select("id", { count: "exact", head: true })
      .gte("created_at", thirtyDaysAgoIso),
    admin
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .gte("created_at", thirtyDaysAgoIso),
    admin
      .from("chat_messages")
      .select("cost_usd, created_at")
      .not("cost_usd", "is", null),
  ]);

  let allTimeCost = 0;
  let last30Cost = 0;
  for (const r of costRows ?? []) {
    const c = Number(r.cost_usd ?? 0);
    allTimeCost += c;
    if ((r.created_at as string) >= thirtyDaysAgoIso) last30Cost += c;
  }

  // 2. Per-day rollup over last 30 days.
  const { data: messagesForChart } = await admin
    .from("chat_messages")
    .select("created_at, cost_usd, role")
    .gte("created_at", thirtyDaysAgoIso)
    .order("created_at", { ascending: true });

  const byDay = new Map<string, { day: string; messages: number; cost: number }>();
  for (const m of messagesForChart ?? []) {
    if (m.role !== "assistant") continue; // only assistant rows have cost
    const day = (m.created_at as string).slice(0, 10);
    const row = byDay.get(day) ?? { day, messages: 0, cost: 0 };
    row.messages += 1;
    row.cost += Number(m.cost_usd ?? 0);
    byDay.set(day, row);
  }
  // Fill missing days with zeros so the chart is continuous.
  const daily: Array<{ day: string; messages: number; cost: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000);
    const key = d.toISOString().slice(0, 10);
    daily.push(byDay.get(key) ?? { day: key, messages: 0, cost: 0 });
  }

  // 3. Per-advisor leaderboard.
  const { data: perAdvisorRaw } = await admin
    .from("chat_messages")
    .select("user_id, cost_usd, role, created_at")
    .gte("created_at", thirtyDaysAgoIso);

  const advisorAgg = new Map<
    string,
    { user_id: string; messages: number; cost: number; lastActivity: string }
  >();
  for (const m of perAdvisorRaw ?? []) {
    if (m.role !== "assistant") continue;
    const id = m.user_id as string;
    const row = advisorAgg.get(id) ?? {
      user_id: id,
      messages: 0,
      cost: 0,
      lastActivity: m.created_at as string,
    };
    row.messages += 1;
    row.cost += Number(m.cost_usd ?? 0);
    if ((m.created_at as string) > row.lastActivity) row.lastActivity = m.created_at as string;
    advisorAgg.set(id, row);
  }

  // Hydrate advisor display names.
  const advisorIds = Array.from(advisorAgg.keys());
  let perAdvisor: Array<{
    user_id: string;
    name: string;
    email: string | null;
    messages: number;
    cost: number;
    last_activity: string;
  }> = [];
  if (advisorIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email")
      .in("id", advisorIds);
    const { data: settings } = await admin
      .from("user_settings")
      .select("user_id, first_name, last_name")
      .in("user_id", advisorIds);
    const nameById = new Map<string, string>();
    for (const s of settings ?? []) {
      const name = [s.first_name, s.last_name].filter(Boolean).join(" ");
      if (name) nameById.set(s.user_id as string, name);
    }
    const emailById = new Map<string, string>();
    for (const p of profiles ?? []) emailById.set(p.id as string, (p.email as string) ?? "");
    perAdvisor = advisorIds
      .map((id) => {
        const agg = advisorAgg.get(id)!;
        return {
          user_id: id,
          name: nameById.get(id) || emailById.get(id) || "Advisor",
          email: emailById.get(id) || null,
          messages: agg.messages,
          cost: agg.cost,
          last_activity: agg.lastActivity,
        };
      })
      .sort((a, b) => b.cost - a.cost);
  }

  // 4. Recent conversations across all advisors.
  const { data: convoRows } = await admin
    .from("chat_conversations")
    .select("id, user_id, title, last_message_at, created_at")
    .order("last_message_at", { ascending: false })
    .limit(50);

  // Hydrate user names for the conversation list too.
  const convoUserIds = Array.from(new Set((convoRows ?? []).map((c) => c.user_id as string)));
  const convoNameById = new Map<string, string>();
  if (convoUserIds.length > 0) {
    const { data: settings } = await admin
      .from("user_settings")
      .select("user_id, first_name, last_name")
      .in("user_id", convoUserIds);
    for (const s of settings ?? []) {
      const name = [s.first_name, s.last_name].filter(Boolean).join(" ");
      if (name) convoNameById.set(s.user_id as string, name);
    }
    if (convoUserIds.length > convoNameById.size) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, email")
        .in("id", convoUserIds);
      for (const p of profiles ?? []) {
        if (!convoNameById.has(p.id as string)) {
          convoNameById.set(p.id as string, (p.email as string) ?? "Advisor");
        }
      }
    }
  }

  const recentConversations = (convoRows ?? []).map((c) => ({
    id: c.id as string,
    user_id: c.user_id as string,
    advisor_name: convoNameById.get(c.user_id as string) || "Advisor",
    title: c.title as string | null,
    last_message_at: c.last_message_at as string,
    created_at: c.created_at as string,
  }));

  return Response.json({
    totals: {
      conversations: totalConversations ?? 0,
      messages: totalMessages ?? 0,
      cost_usd: allTimeCost,
      last30Conversations: last30Conversations ?? 0,
      last30Messages: last30Messages ?? 0,
      last30Cost: last30Cost,
    },
    daily,
    perAdvisor,
    recentConversations,
  });
}
