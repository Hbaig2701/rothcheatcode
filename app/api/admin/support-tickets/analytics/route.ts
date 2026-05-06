import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/auth/requireAdmin'
import {
  SUPPORT_SEVERITIES,
  SUPPORT_PRIORITIES,
  SUPPORT_CATEGORIES,
  SUPPORT_STATUSES,
  type SupportSeverity,
  type SupportPriority,
  type SupportCategory,
  type SupportStatus,
} from '@/lib/types/support'

type Range = '7d' | '30d' | '90d' | 'all'

function rangeStart(range: Range): Date | null {
  const now = Date.now()
  const day = 86_400_000
  switch (range) {
    case '7d': return new Date(now - 7 * day)
    case '30d': return new Date(now - 30 * day)
    case '90d': return new Date(now - 90 * day)
    case 'all': return null
  }
}

interface TicketRow {
  id: string
  user_id: string
  status: SupportStatus
  severity: SupportSeverity
  priority: SupportPriority
  category: SupportCategory
  created_at: string
  resolved_at: string | null
}

interface CommentRow {
  ticket_id: string
  user_id: string
  is_internal: boolean
  created_at: string
}

interface EventRow {
  ticket_id: string
  event_type: string
  old_value: string | null
  new_value: string | null
  created_at: string
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!(await isAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const rangeParam = (url.searchParams.get('range') ?? '30d') as Range
  const range: Range = (['7d', '30d', '90d', 'all'] as const).includes(rangeParam) ? rangeParam : '30d'
  const start = rangeStart(range)

  // 1. Tickets in range
  let ticketQuery = supabase
    .from('support_tickets')
    .select('id, user_id, status, severity, priority, category, created_at, resolved_at')
  if (start) ticketQuery = ticketQuery.gte('created_at', start.toISOString())
  const { data: ticketData, error: ticketError } = await ticketQuery
  if (ticketError) {
    return NextResponse.json({ error: ticketError.message }, { status: 500 })
  }
  const tickets = (ticketData ?? []) as TicketRow[]
  const ticketIds = tickets.map((t) => t.id)

  // 2. All comments + events for those tickets (one round-trip each)
  const [commentsRes, eventsRes] = ticketIds.length > 0
    ? await Promise.all([
        supabase.from('support_ticket_comments').select('ticket_id, user_id, is_internal, created_at').in('ticket_id', ticketIds),
        supabase.from('support_ticket_events').select('ticket_id, event_type, old_value, new_value, created_at').in('ticket_id', ticketIds),
      ])
    : [{ data: [] as CommentRow[] }, { data: [] as EventRow[] }] as const
  const comments = (commentsRes.data ?? []) as CommentRow[]
  const events = (eventsRes.data ?? []) as EventRow[]

  // 3. Admin user_ids — to identify "first admin reply"
  const { data: adminProfiles } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
  const adminIds = new Set(((adminProfiles ?? []) as Array<{ id: string }>).map((p) => p.id))

  // 4. Status / Severity / Category / Priority breakdowns
  const statusCounts: Record<SupportStatus, number> = { open: 0, in_progress: 0, waiting_on_user: 0, resolved: 0, closed: 0 }
  const severityCounts: Record<SupportSeverity, number> = { low: 0, medium: 0, high: 0, critical: 0 }
  const categoryCounts: Record<SupportCategory, number> = { bug: 0, data_issue: 0, feature_request: 0, question: 0, billing: 0, other: 0 }
  const priorityCounts: Record<SupportPriority, number> = { low: 0, medium: 0, high: 0, urgent: 0 }

  for (const t of tickets) {
    statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1
    severityCounts[t.severity] = (severityCounts[t.severity] ?? 0) + 1
    categoryCounts[t.category] = (categoryCounts[t.category] ?? 0) + 1
    priorityCounts[t.priority] = (priorityCounts[t.priority] ?? 0) + 1
  }

  // 5. Tickets per day — fill missing days with 0 so bar chart isn't choppy
  const perDay = new Map<string, number>()
  for (const t of tickets) {
    const day = isoDate(new Date(t.created_at))
    perDay.set(day, (perDay.get(day) ?? 0) + 1)
  }
  // Build a continuous date series
  const daySeries: { date: string; count: number }[] = []
  if (range !== 'all' || tickets.length > 0) {
    const end = new Date()
    const startDay = start
      ?? (tickets.length > 0
        ? new Date(Math.min(...tickets.map((t) => new Date(t.created_at).getTime())))
        : new Date(end.getTime() - 30 * 86_400_000))
    const cursor = new Date(startDay)
    cursor.setUTCHours(0, 0, 0, 0)
    while (cursor <= end) {
      const d = isoDate(cursor)
      daySeries.push({ date: d, count: perDay.get(d) ?? 0 })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
  }

  // 6. Avg resolution time — for tickets with resolved_at set
  const resolutionMs: number[] = []
  for (const t of tickets) {
    if (!t.resolved_at) continue
    const ms = new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime()
    if (ms > 0) resolutionMs.push(ms)
  }
  const avgResolutionHours = resolutionMs.length > 0
    ? resolutionMs.reduce((s, n) => s + n, 0) / resolutionMs.length / 3_600_000
    : null
  const medianResolutionHours = (() => {
    const m = median(resolutionMs)
    return m == null ? null : m / 3_600_000
  })()

  // 7. Median time-to-first-admin-reply
  // Group public comments per ticket, find earliest by an admin author
  const firstAdminReplyByTicket = new Map<string, string>()
  const sortedComments = [...comments]
    .filter((c) => !c.is_internal)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  for (const c of sortedComments) {
    if (!adminIds.has(c.user_id)) continue
    if (firstAdminReplyByTicket.has(c.ticket_id)) continue
    firstAdminReplyByTicket.set(c.ticket_id, c.created_at)
  }
  const firstReplyMs: number[] = []
  for (const t of tickets) {
    const replyAt = firstAdminReplyByTicket.get(t.id)
    if (!replyAt) continue
    const ms = new Date(replyAt).getTime() - new Date(t.created_at).getTime()
    if (ms > 0) firstReplyMs.push(ms)
  }
  const medianFirstReplyHours = (() => {
    const m = median(firstReplyMs)
    return m == null ? null : m / 3_600_000
  })()
  const ticketsAwaitingFirstReply = tickets.filter((t) =>
    !firstAdminReplyByTicket.has(t.id)
    && t.status !== 'closed'
    && t.status !== 'resolved'
  ).length

  // 8. Reopen rate — status_change events going *_to_ open from resolved/closed
  let reopenedCount = 0
  const ticketsReopened = new Set<string>()
  for (const e of events) {
    if (e.event_type !== 'status_change') continue
    if (e.new_value !== 'open') continue
    if (e.old_value !== 'resolved' && e.old_value !== 'closed') continue
    if (ticketsReopened.has(e.ticket_id)) continue
    ticketsReopened.add(e.ticket_id)
    reopenedCount++
  }
  const everResolvedCount = tickets.filter((t) => t.resolved_at != null).length
  const reopenRate = everResolvedCount > 0 ? (reopenedCount / everResolvedCount) * 100 : null

  // 9. Top requesters
  const ticketsByAdvisor = new Map<string, number>()
  for (const t of tickets) {
    ticketsByAdvisor.set(t.user_id, (ticketsByAdvisor.get(t.user_id) ?? 0) + 1)
  }
  const topAdvisorIds = Array.from(ticketsByAdvisor.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id)
  const topAdvisors: Array<{ id: string; name: string; email: string | null; count: number }> = []
  if (topAdvisorIds.length > 0) {
    const [profileRes, settingsRes] = await Promise.all([
      supabase.from('profiles').select('id, email').in('id', topAdvisorIds),
      supabase.from('user_settings').select('user_id, first_name, last_name').in('user_id', topAdvisorIds),
    ])
    const settingsByUser = new Map<string, { first_name: string | null; last_name: string | null }>()
    for (const s of (settingsRes.data ?? []) as Array<{ user_id: string; first_name: string | null; last_name: string | null }>) {
      settingsByUser.set(s.user_id, { first_name: s.first_name, last_name: s.last_name })
    }
    for (const id of topAdvisorIds) {
      const p = ((profileRes.data ?? []) as Array<{ id: string; email: string | null }>).find((x) => x.id === id)
      const s = settingsByUser.get(id)
      const fullName = [s?.first_name, s?.last_name].filter(Boolean).join(' ').trim()
      topAdvisors.push({
        id,
        name: fullName || p?.email || 'Unknown',
        email: p?.email ?? null,
        count: ticketsByAdvisor.get(id) ?? 0,
      })
    }
  }

  // Backlog = anything not closed/resolved (regardless of when created — this
  // matters for the "what's on my plate right now" snapshot).
  const { data: backlogData } = await supabase
    .from('support_tickets')
    .select('id, status')
    .in('status', ['open', 'in_progress', 'waiting_on_user'])
  const backlog = {
    total: backlogData?.length ?? 0,
    open: (backlogData ?? []).filter((t) => t.status === 'open').length,
    inProgress: (backlogData ?? []).filter((t) => t.status === 'in_progress').length,
    waitingOnUser: (backlogData ?? []).filter((t) => t.status === 'waiting_on_user').length,
  }

  return NextResponse.json({
    range,
    rangeStart: start ? start.toISOString() : null,
    totals: {
      tickets: tickets.length,
      everResolved: everResolvedCount,
      ticketsAwaitingFirstReply,
      reopened: reopenedCount,
    },
    backlog,
    avgResolutionHours,
    medianResolutionHours,
    medianFirstReplyHours,
    reopenRate,
    perDay: daySeries,
    breakdowns: {
      status: SUPPORT_STATUSES.map((k) => ({ key: k, count: statusCounts[k] })),
      severity: SUPPORT_SEVERITIES.map((k) => ({ key: k, count: severityCounts[k] })),
      category: SUPPORT_CATEGORIES.map((k) => ({ key: k, count: categoryCounts[k] })),
      priority: SUPPORT_PRIORITIES.map((k) => ({ key: k, count: priorityCounts[k] })),
    },
    topAdvisors,
  })
}
