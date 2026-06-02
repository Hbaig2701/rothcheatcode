"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, PlayCircle, X, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

type FilterKey = "all" | "completed" | "started_not_completed" | "dismissed_no_watch" | "never_engaged";

interface Advisor {
  user_id: string;
  email: string | null;
  name: string | null;
  account_created_at: string;
  dismissed_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

interface FunnelResponse {
  totals: {
    advisors: number;
    completed: number;
    started_not_completed: number;
    dismissed_no_watch: number;
    never_engaged: number;
  };
  advisors: Advisor[];
}

function bucketOf(a: Advisor): Exclude<FilterKey, "all"> {
  if (a.completed_at) return "completed";
  if (a.started_at) return "started_not_completed";
  if (a.dismissed_at) return "dismissed_no_watch";
  return "never_engaged";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function bucketIcon(bucket: Exclude<FilterKey, "all">) {
  switch (bucket) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-green" />;
    case "started_not_completed":
      return <PlayCircle className="h-4 w-4 text-gold" />;
    case "dismissed_no_watch":
      return <X className="h-4 w-4 text-text-dim" />;
    case "never_engaged":
      return <Circle className="h-4 w-4 text-text-dim/50" />;
  }
}

function bucketLabel(bucket: Exclude<FilterKey, "all">): string {
  switch (bucket) {
    case "completed": return "Completed";
    case "started_not_completed": return "Started, didn't finish";
    case "dismissed_no_watch": return "Dismissed";
    case "never_engaged": return "Hasn't seen it yet";
  }
}

export function OnboardingFunnel() {
  const [filter, setFilter] = useState<FilterKey>("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "onboarding"],
    queryFn: async (): Promise<FunnelResponse> => {
      const res = await fetch("/api/admin/onboarding");
      if (!res.ok) throw new Error("Failed to load funnel");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    if (filter === "all") return data.advisors;
    return data.advisors.filter((a) => bucketOf(a) === filter);
  }, [data, filter]);

  if (isLoading) return <p className="text-sm text-text-dim">Loading funnel…</p>;
  if (error || !data) {
    return (
      <p className="text-sm text-red-500">
        Failed to load. The onboarding columns on user_settings may not be migrated yet.
      </p>
    );
  }

  const { totals } = data;
  const completionPct = totals.advisors > 0 ? Math.round((totals.completed / totals.advisors) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Total advisors" value={totals.advisors} active={filter === "all"} onClick={() => setFilter("all")} />
        <StatCard label="Completed" value={totals.completed} accent="green" sub={`${completionPct}%`} active={filter === "completed"} onClick={() => setFilter("completed")} />
        <StatCard label="Started, didn't finish" value={totals.started_not_completed} active={filter === "started_not_completed"} onClick={() => setFilter("started_not_completed")} />
        <StatCard label="Dismissed" value={totals.dismissed_no_watch} active={filter === "dismissed_no_watch"} onClick={() => setFilter("dismissed_no_watch")} />
        <StatCard label="Hasn't seen yet" value={totals.never_engaged} active={filter === "never_engaged"} onClick={() => setFilter("never_engaged")} />
      </div>

      <div className="rounded-lg border border-border-default overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-card">
            <tr className="text-xs text-text-dim border-b border-border-default">
              <th className="text-left py-2 px-3 font-medium">Advisor</th>
              <th className="text-left py-2 px-3 font-medium">Status</th>
              <th className="text-right py-2 px-3 font-medium">Account created</th>
              <th className="text-right py-2 px-3 font-medium">Started</th>
              <th className="text-right py-2 px-3 font-medium">Completed</th>
              <th className="text-right py-2 px-3 font-medium">Dismissed</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 px-3 text-center text-sm text-text-dim">
                  No advisors in this bucket.
                </td>
              </tr>
            ) : (
              filtered.map((a) => {
                const b = bucketOf(a);
                return (
                  <tr key={a.user_id} className="border-b border-border-default/40 hover:bg-bg-card-hover/40">
                    <td className="py-2 px-3">
                      <div className="flex flex-col">
                        <span className="text-foreground">{a.name ?? "—"}</span>
                        <span className="text-xs text-text-dim">{a.email ?? a.user_id.slice(0, 8)}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        {bucketIcon(b)}
                        {bucketLabel(b)}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right text-text-dim">{fmtDate(a.account_created_at)}</td>
                    <td className="py-2 px-3 text-right text-text-dim">{fmtDate(a.started_at)}</td>
                    <td className="py-2 px-3 text-right text-text-dim">{fmtDate(a.completed_at)}</td>
                    <td className="py-2 px-3 text-right text-text-dim">{fmtDate(a.dismissed_at)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({
  label, value, sub, accent, active, onClick,
}: {
  label: string;
  value: number;
  sub?: string;
  accent?: "green";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-lg border bg-bg-card p-4 transition-all hover:border-gold-border",
        active ? "border-gold-border ring-1 ring-gold/40" : "border-border-default",
      )}
    >
      <p className="text-xs text-text-dim uppercase tracking-wider">{label}</p>
      <p className={cn(
        "text-2xl font-mono font-semibold mt-1",
        accent === "green" ? "text-green" : "text-foreground",
      )}>
        {value}
      </p>
      {sub && <p className="text-xs text-text-dim mt-0.5">{sub}</p>}
    </button>
  );
}
