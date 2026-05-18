"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Bar,
  BarChart,
} from "recharts";

interface DashboardData {
  totals: {
    conversations: number;
    messages: number;
    cost_usd: number;
    last30Conversations: number;
    last30Messages: number;
    last30Cost: number;
  };
  daily: Array<{ day: string; messages: number; cost: number }>;
  perAdvisor: Array<{
    user_id: string;
    name: string;
    email: string | null;
    messages: number;
    cost: number;
    last_activity: string;
  }>;
  recentConversations: Array<{
    id: string;
    user_id: string;
    advisor_name: string;
    title: string | null;
    last_message_at: string;
    created_at: string;
  }>;
}

function formatUSD(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: amount < 10 ? 4 : 2,
  });
}

export function AiChatDashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "ai-chat"],
    queryFn: async (): Promise<DashboardData> => {
      const res = await fetch("/api/admin/ai-chat");
      if (!res.ok) throw new Error("Failed to load analytics");
      return res.json();
    },
    // Auto-refresh once a minute so spend numbers stay roughly live as
    // advisors chat. Cheap query — RLS-bypassing admin client on a small
    // table.
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return <p className="text-sm text-text-dim">Loading analytics…</p>;
  }
  if (error || !data) {
    return (
      <p className="text-sm text-red-500">
        Failed to load analytics. Check that the chat tables have been migrated.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Spend (last 30d)"
          value={formatUSD(data.totals.last30Cost)}
          sub={`${data.totals.last30Messages} assistant messages`}
        />
        <StatCard
          label="Spend (all-time)"
          value={formatUSD(data.totals.cost_usd)}
          sub={`${data.totals.messages} total messages`}
        />
        <StatCard
          label="Conversations (last 30d)"
          value={String(data.totals.last30Conversations)}
          sub={`${data.totals.conversations} total`}
        />
        <StatCard
          label="Avg cost / message"
          value={
            data.totals.messages > 0
              ? formatUSD(data.totals.cost_usd / data.totals.messages)
              : "—"
          }
          sub="across all assistant turns"
        />
      </div>

      {/* Daily charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Daily spend — last 30 days">
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.daily} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="day"
                  tickFormatter={(d) => (d as string).slice(5)}
                  tick={{ fontSize: 10 }}
                />
                <YAxis tickFormatter={(v) => `$${Number(v).toFixed(2)}`} tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(v) => formatUSD(Number(v))}
                  labelFormatter={(d) => d as string}
                />
                <Line
                  type="monotone"
                  dataKey="cost"
                  stroke="#D4AF37"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Daily messages — last 30 days">
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.daily} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="day"
                  tickFormatter={(d) => (d as string).slice(5)}
                  tick={{ fontSize: 10 }}
                />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  labelFormatter={(d) => d as string}
                  formatter={(v) => `${v} messages`}
                />
                <Bar dataKey="messages" fill="#D4AF37" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Per-advisor leaderboard */}
      <Card title="Advisor usage (last 30d) — sorted by spend">
        {data.perAdvisor.length === 0 ? (
          <p className="text-sm text-text-dim">No usage yet in the last 30 days.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-text-dim border-b border-border-default">
                <th className="text-left py-2 font-medium">Advisor</th>
                <th className="text-right py-2 font-medium">Messages</th>
                <th className="text-right py-2 font-medium">Spend</th>
                <th className="text-right py-2 font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {data.perAdvisor.map((a) => (
                <tr key={a.user_id} className="border-b border-border-default/40">
                  <td className="py-2.5">
                    <div className="font-medium text-foreground">{a.name}</div>
                    {a.email && <div className="text-xs text-text-dim">{a.email}</div>}
                  </td>
                  <td className="py-2.5 text-right">{a.messages}</td>
                  <td className="py-2.5 text-right font-mono">{formatUSD(a.cost)}</td>
                  <td className="py-2.5 text-right text-xs text-text-dim">
                    {new Date(a.last_activity).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Recent conversations */}
      <Card title="Recent conversations">
        {data.recentConversations.length === 0 ? (
          <p className="text-sm text-text-dim">No conversations yet.</p>
        ) : (
          <ul className="divide-y divide-border-default/40">
            {data.recentConversations.map((c) => (
              <li key={c.id} className="py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <Link
                    href={`/admin/ai-chat/conversations/${c.id}`}
                    className="text-sm font-medium text-foreground hover:text-gold transition-colors truncate block"
                  >
                    {c.title || "Untitled conversation"}
                  </Link>
                  <div className="text-xs text-text-dim">
                    {c.advisor_name} · started {new Date(c.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="text-xs text-text-dim shrink-0">
                  {new Date(c.last_message_at).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border-default bg-bg-card p-4">
      <div className="text-xs uppercase tracking-wider text-text-dim">{label}</div>
      <div className="text-2xl font-semibold text-foreground mt-2">{value}</div>
      {sub && <div className="text-xs text-text-dim mt-1">{sub}</div>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border-default bg-bg-card p-5">
      <h2 className="text-sm font-medium text-foreground mb-4">{title}</h2>
      {children}
    </div>
  );
}
