'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  LogIn, BarChart3, UserPlus, FileDown, Phone, Package, LifeBuoy,
  ChevronDown, ChevronRight, Loader2,
} from 'lucide-react';

type ActivityKind =
  | 'login' | 'scenario_run' | 'client_created' | 'pdf_export'
  | 'sales_call' | 'product_created' | 'support_ticket';

interface ActivityEvent {
  ts: string;
  kind: ActivityKind;
  detail?: string;
  href?: string;
  meta?: Record<string, string | number>;
}

interface UserActivity {
  user_id: string;
  email: string;
  name: string | null;
  lastActivityAt: string;
  counts: Record<ActivityKind, number>;
  events: ActivityEvent[];
}

interface TodayResponse {
  date: string;
  tz: string;
  totals: Record<ActivityKind, number>;
  activeUserCount: number;
  users: UserActivity[];
}

const KIND_META: Record<ActivityKind, { label: string; icon: typeof LogIn; color: string }> = {
  login:           { label: 'Login',          icon: LogIn,    color: 'text-sky-400' },
  scenario_run:    { label: 'Scenario Run',   icon: BarChart3, color: 'text-emerald-400' },
  client_created:  { label: 'Client Created', icon: UserPlus, color: 'text-amber-400' },
  pdf_export:      { label: 'PDF Export',     icon: FileDown, color: 'text-violet-400' },
  sales_call:      { label: 'Sales Call',     icon: Phone,    color: 'text-pink-400' },
  product_created: { label: 'Product Created',icon: Package,  color: 'text-orange-400' },
  support_ticket:  { label: 'Support Ticket', icon: LifeBuoy, color: 'text-red-400' },
};

const KIND_ORDER: ActivityKind[] = [
  'login', 'scenario_run', 'client_created', 'pdf_export',
  'sales_call', 'product_created', 'support_ticket',
];

function todayInNY(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function formatEstTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(iso));
}

function formatEstDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  // Render NY-local label without timezone shift confusing the date.
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

export default function AdminTodayPage() {
  const today = useMemo(() => todayInNY(), []);
  const [date, setDate] = useState<string>(today);
  const [data, setData] = useState<TodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/today?date=${encodeURIComponent(date)}`)
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? 'Failed to load');
        return r.json() as Promise<TodayResponse>;
      })
      .then(d => { if (!cancelled) { setData(d); setExpandedUsers(new Set(d.users.map(u => u.user_id))); } })
      .catch(e => { if (!cancelled) setError(String(e?.message ?? e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [date]);

  const toggleUser = (uid: string) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  };

  const isToday = date === today;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
          <p className="text-sm text-text-dim mt-1">
            {formatEstDateLabel(date)} · all times in EST/EDT (America/New_York)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDate(shiftDate(date, -1))}
            className="px-2.5 py-1.5 text-xs rounded-md border border-border-default hover:bg-bg-card transition-colors"
          >
            ← Prev day
          </button>
          <input
            type="date"
            value={date}
            max={today}
            onChange={e => setDate(e.target.value || today)}
            className="px-2.5 py-1.5 text-xs rounded-md border border-border-default bg-background"
          />
          {!isToday && (
            <button
              onClick={() => setDate(today)}
              className="px-2.5 py-1.5 text-xs rounded-md border border-border-default hover:bg-bg-card transition-colors"
            >
              Today
            </button>
          )}
          {isToday && date !== today && (
            <button
              onClick={() => setDate(shiftDate(date, 1))}
              disabled={shiftDate(date, 1) > today}
              className="px-2.5 py-1.5 text-xs rounded-md border border-border-default hover:bg-bg-card transition-colors disabled:opacity-40"
            >
              Next day →
            </button>
          )}
        </div>
      </div>

      {/* Loading / error */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-text-dim">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading activity…
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {data && !loading && (
        <>
          {/* Totals row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {KIND_ORDER.map(kind => {
              const meta = KIND_META[kind];
              const Icon = meta.icon;
              const value = data.totals[kind];
              return (
                <div key={kind} className="rounded-lg border border-border-default bg-bg-card p-3">
                  <div className={`flex items-center gap-1.5 text-[11px] uppercase tracking-wide ${meta.color}`}>
                    <Icon className="h-3.5 w-3.5" /> {meta.label}
                  </div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
                </div>
              );
            })}
          </div>

          <div className="text-xs text-text-dim">
            {data.activeUserCount} active {data.activeUserCount === 1 ? 'user' : 'users'} · most-recent activity first
          </div>

          {/* User cards */}
          {data.users.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border-default p-8 text-center text-sm text-text-dim">
              No advisor activity recorded for {formatEstDateLabel(date)}.
            </div>
          ) : (
            <div className="space-y-3">
              {data.users.map(u => {
                const expanded = expandedUsers.has(u.user_id);
                return (
                  <div key={u.user_id} className="rounded-lg border border-border-default bg-bg-card">
                    <button
                      onClick={() => toggleUser(u.user_id)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[rgba(255,255,255,0.02)] transition-colors text-left"
                    >
                      <span className="text-text-dim">
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="font-medium text-foreground truncate">
                            {u.name ?? u.email}
                          </span>
                          {u.name && (
                            <span className="text-xs text-text-dim truncate">{u.email}</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 mt-1.5">
                          {KIND_ORDER.filter(k => u.counts[k] > 0).map(k => {
                            const meta = KIND_META[k];
                            const Icon = meta.icon;
                            return (
                              <span
                                key={k}
                                className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border border-border-default ${meta.color}`}
                              >
                                <Icon className="h-3 w-3" />
                                {u.counts[k]} {meta.label}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      <div className="text-xs text-text-dim shrink-0">
                        last: {formatEstTime(u.lastActivityAt)}
                      </div>
                    </button>

                    {expanded && (
                      <div className="border-t border-border-default px-4 py-3">
                        <ol className="relative border-l border-border-default pl-4 space-y-2 ml-1">
                          {u.events.map((e, i) => {
                            const meta = KIND_META[e.kind];
                            const Icon = meta.icon;
                            return (
                              <li key={i} className="flex items-start gap-2 text-sm">
                                <span className={`-ml-[22px] mt-[3px] inline-flex h-4 w-4 items-center justify-center rounded-full bg-bg-card border border-border-default ${meta.color}`}>
                                  <Icon className="h-2.5 w-2.5" />
                                </span>
                                <span className="text-text-dim tabular-nums w-16 shrink-0">
                                  {formatEstTime(e.ts)}
                                </span>
                                <span className="flex-1">
                                  <span className="text-foreground">{meta.label}</span>
                                  {e.detail && (
                                    <>
                                      <span className="text-text-dim"> · </span>
                                      {e.href ? (
                                        <Link href={e.href} className="text-foreground/85 hover:text-foreground underline-offset-2 hover:underline">
                                          {e.detail}
                                        </Link>
                                      ) : (
                                        <span className="text-foreground/85">{e.detail}</span>
                                      )}
                                    </>
                                  )}
                                  {e.meta && Object.keys(e.meta).length > 0 && (
                                    <span className="text-text-dim text-xs">
                                      {' '}({Object.entries(e.meta).map(([k, v]) => `${k}: ${v}`).join(', ')})
                                    </span>
                                  )}
                                </span>
                              </li>
                            );
                          })}
                        </ol>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
