'use client'

import { useEffect, useState } from 'react'
import { BarChart3, Loader2, Clock, AlertTriangle, RefreshCw, MessageSquare } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'
import {
  STATUS_LABELS,
  SEVERITY_LABELS,
  CATEGORY_LABELS,
  PRIORITY_LABELS,
} from '@/lib/types/support'

type Range = '7d' | '30d' | '90d' | 'all'

interface AnalyticsResponse {
  range: Range
  rangeStart: string | null
  totals: {
    tickets: number
    everResolved: number
    ticketsAwaitingFirstReply: number
    reopened: number
  }
  backlog: { total: number; open: number; inProgress: number; waitingOnUser: number }
  avgResolutionHours: number | null
  medianResolutionHours: number | null
  medianFirstReplyHours: number | null
  reopenRate: number | null
  perDay: { date: string; count: number }[]
  breakdowns: {
    status: { key: string; count: number }[]
    severity: { key: string; count: number }[]
    category: { key: string; count: number }[]
    priority: { key: string; count: number }[]
  }
  topAdvisors: { id: string; name: string; email: string | null; count: number }[]
}

function formatHours(h: number | null): string {
  if (h == null) return '—'
  if (h < 1) {
    const m = Math.round(h * 60)
    return `${m} min`
  }
  if (h < 48) {
    return `${h.toFixed(1)}h`
  }
  return `${(h / 24).toFixed(1)}d`
}

function formatDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'all', label: 'All time' },
]

const SEVERITY_BAR_COLOR: Record<string, string> = {
  low: 'bg-slate-500/40',
  medium: 'bg-blue-500/40',
  high: 'bg-orange-500/40',
  critical: 'bg-red-500/40',
}

const CATEGORY_BAR_COLOR: Record<string, string> = {
  bug: 'bg-red-500/40',
  data_issue: 'bg-orange-500/40',
  feature_request: 'bg-purple-500/40',
  question: 'bg-blue-500/40',
  billing: 'bg-emerald-500/40',
  other: 'bg-slate-500/40',
}

const STATUS_BAR_COLOR: Record<string, string> = {
  open: 'bg-blue-500/40',
  in_progress: 'bg-yellow-500/40',
  waiting_on_user: 'bg-purple-500/40',
  resolved: 'bg-emerald-500/40',
  closed: 'bg-slate-500/40',
}

export default function SupportAnalyticsPage() {
  const [range, setRange] = useState<Range>('30d')
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/admin/support-tickets/analytics?range=${range}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Status ${r.status}`))))
      .then((j: AnalyticsResponse) => {
        if (cancelled) return
        setData(j)
        setError(null)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e.message ?? 'Failed to load analytics')
      })
    return () => {
      cancelled = true
    }
  }, [range])

  const loading = !data && !error

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-accent border border-gold-border">
            <BarChart3 className="h-6 w-6 text-gold" />
          </div>
          <div>
            <h1 className="text-[28px] font-display font-bold text-foreground leading-tight">Support Analytics</h1>
            <p className="text-sm text-text-dim mt-0.5">Volume, response, and resolution at a glance</p>
          </div>
        </div>
        <div className="inline-flex items-center rounded-md border border-border-default bg-bg-card p-0.5">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setRange(opt.value)}
              className={cn(
                'rounded-[4px] px-3 py-1 text-xs transition-colors',
                range === opt.value ? 'bg-accent text-foreground' : 'text-text-dim hover:text-foreground'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-text-dim" />
        </div>
      )}

      {error && !loading && (
        <div className="rounded-[12px] border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && data && <Dashboard data={data} />}
    </div>
  )
}

function Dashboard({ data }: { data: AnalyticsResponse }) {
  const totalSeverity = data.breakdowns.severity.reduce((s, x) => s + x.count, 0)
  const totalCategory = data.breakdowns.category.reduce((s, x) => s + x.count, 0)
  const totalStatus = data.breakdowns.status.reduce((s, x) => s + x.count, 0)

  return (
    <div className="space-y-6">
      {/* Top stat row */}
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Tickets in window"
          value={data.totals.tickets.toString()}
          hint={`${data.totals.everResolved} resolved`}
          icon={<MessageSquare className="size-4" />}
        />
        <StatCard
          label="Active backlog"
          value={data.backlog.total.toString()}
          hint={`${data.backlog.open} open · ${data.backlog.inProgress} in progress · ${data.backlog.waitingOnUser} waiting`}
          icon={<AlertTriangle className="size-4" />}
          tone={data.backlog.total > 5 ? 'warn' : 'default'}
        />
        <StatCard
          label="Avg resolution"
          value={formatHours(data.avgResolutionHours)}
          hint={data.medianResolutionHours != null ? `Median ${formatHours(data.medianResolutionHours)}` : 'No resolved tickets yet'}
          icon={<Clock className="size-4" />}
        />
        <StatCard
          label="Median first reply"
          value={formatHours(data.medianFirstReplyHours)}
          hint={data.totals.ticketsAwaitingFirstReply > 0
            ? `${data.totals.ticketsAwaitingFirstReply} awaiting`
            : 'All caught up'}
          icon={<Clock className="size-4" />}
          tone={data.totals.ticketsAwaitingFirstReply > 0 ? 'warn' : 'default'}
        />
        <StatCard
          label="Reopen rate"
          value={data.reopenRate != null ? `${data.reopenRate.toFixed(0)}%` : '—'}
          hint={`${data.totals.reopened} reopened of ${data.totals.everResolved} resolved`}
          icon={<RefreshCw className="size-4" />}
          tone={(data.reopenRate ?? 0) > 20 ? 'warn' : 'default'}
        />
      </div>

      {/* Tickets per day chart */}
      <div className="rounded-[14px] bg-bg-card border border-border-default p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-text-dimmer mb-4">Tickets per day</h3>
        {data.perDay.length === 0 ? (
          <p className="text-sm text-text-dim italic">No data in this range.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.perDay} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDay}
                  stroke="rgba(255,255,255,0.4)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.4)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{ background: 'rgba(20,20,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(v: string) => formatDay(v)}
                  formatter={(v: number | undefined) => [v ?? 0, 'tickets']}
                />
                <Bar dataKey="count" fill="#d4af37" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Two-column breakdowns */}
      <div className="grid gap-6 lg:grid-cols-2">
        <BreakdownCard
          title="By severity"
          rows={data.breakdowns.severity.map((r) => ({
            key: r.key,
            label: SEVERITY_LABELS[r.key as keyof typeof SEVERITY_LABELS] ?? r.key,
            count: r.count,
            colorClass: SEVERITY_BAR_COLOR[r.key] ?? 'bg-slate-500/40',
          }))}
          total={totalSeverity}
        />
        <BreakdownCard
          title="By category"
          rows={data.breakdowns.category.map((r) => ({
            key: r.key,
            label: CATEGORY_LABELS[r.key as keyof typeof CATEGORY_LABELS] ?? r.key,
            count: r.count,
            colorClass: CATEGORY_BAR_COLOR[r.key] ?? 'bg-slate-500/40',
          }))}
          total={totalCategory}
        />
      </div>

      {/* Status + top advisors */}
      <div className="grid gap-6 lg:grid-cols-2">
        <BreakdownCard
          title="By status"
          rows={data.breakdowns.status.map((r) => ({
            key: r.key,
            label: STATUS_LABELS[r.key as keyof typeof STATUS_LABELS] ?? r.key,
            count: r.count,
            colorClass: STATUS_BAR_COLOR[r.key] ?? 'bg-slate-500/40',
          }))}
          total={totalStatus}
        />
        <div className="rounded-[14px] bg-bg-card border border-border-default p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-text-dimmer mb-4">Top requesters</h3>
          {data.topAdvisors.length === 0 ? (
            <p className="text-sm text-text-dim italic">No tickets in this range.</p>
          ) : (
            <ul className="space-y-2">
              {data.topAdvisors.map((a, i) => (
                <li key={a.id} className="flex items-center justify-between rounded-[10px] border border-border-default/60 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex size-6 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-foreground/85">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">{a.name}</p>
                      {a.email && <p className="text-xs text-text-dim truncate">{a.email}</p>}
                    </div>
                  </div>
                  <span className="text-sm font-mono text-foreground shrink-0">{a.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Priority — small inline card since it's admin-set, not advisor-set */}
      <BreakdownCard
        title="By priority (admin-set)"
        rows={data.breakdowns.priority.map((r) => ({
          key: r.key,
          label: PRIORITY_LABELS[r.key as keyof typeof PRIORITY_LABELS] ?? r.key,
          count: r.count,
          colorClass: SEVERITY_BAR_COLOR[r.key] ?? 'bg-slate-500/40',
        }))}
        total={data.breakdowns.priority.reduce((s, x) => s + x.count, 0)}
      />
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
}: {
  label: string
  value: string
  hint?: string
  icon?: React.ReactNode
  tone?: 'default' | 'warn'
}) {
  return (
    <div
      className={cn(
        'rounded-[12px] border bg-bg-card p-4',
        tone === 'warn' ? 'border-yellow-500/40' : 'border-border-default'
      )}
    >
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-text-dimmer mb-1.5">
        {icon}
        {label}
      </div>
      <p className={cn('text-2xl font-mono font-medium', tone === 'warn' ? 'text-yellow-400' : 'text-foreground')}>
        {value}
      </p>
      {hint && <p className="text-xs text-text-dim mt-1">{hint}</p>}
    </div>
  )
}

function BreakdownCard({
  title,
  rows,
  total,
}: {
  title: string
  rows: { key: string; label: string; count: number; colorClass: string }[]
  total: number
}) {
  return (
    <div className="rounded-[14px] bg-bg-card border border-border-default p-6">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-text-dimmer mb-4">{title}</h3>
      {total === 0 ? (
        <p className="text-sm text-text-dim italic">No tickets in this range.</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => {
            const pct = total > 0 ? (r.count / total) * 100 : 0
            return (
              <li key={r.key}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-foreground">{r.label}</span>
                  <span className="font-mono text-text-dim">
                    {r.count} <span className="text-text-dimmer">({pct.toFixed(0)}%)</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-bg-card-hover overflow-hidden">
                  <div
                    className={cn('h-full rounded-full', r.colorClass)}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
