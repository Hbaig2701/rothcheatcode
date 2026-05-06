import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { LifeBuoy } from 'lucide-react'
import { StatusBadge, SeverityBadge, PriorityBadge } from '@/components/support/status-badge'
import { KanbanBoard } from '@/components/support/kanban-board'
import { ViewToggle } from '@/components/support/view-toggle'
import { AdminFilterBar } from '@/components/support/admin-filter-bar'
import { fetchProfilesByIds, profileDisplayName } from '@/lib/queries/support'
import {
  SUPPORT_STATUSES,
  type SupportStatus,
  type SupportSeverity,
  type SupportPriority,
  type SupportTicket,
} from '@/lib/types/support'

interface PageProps {
  searchParams: Promise<{
    view?: string
    status?: string
    severity?: string
    priority?: string
    advisor?: string
    assignee?: string
    q?: string
  }>
}

function formatRelative(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days < 1) return 'today'
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days} days ago`
  return `${Math.floor(days / 30)}mo ago`
}

export default async function SupportCentrePage({ searchParams }: PageProps) {
  const params = await searchParams
  const view = params.view === 'kanban' ? 'kanban' : 'list'
  const supabase = await createClient()

  // Fetch tickets — apply filters server-side via supabase query
  let q = supabase.from('support_tickets').select('*').order('created_at', { ascending: false })
  if (params.status && SUPPORT_STATUSES.includes(params.status as SupportStatus)) {
    q = q.eq('status', params.status)
  }
  if (params.severity) q = q.eq('severity', params.severity)
  if (params.priority) q = q.eq('priority', params.priority)
  if (params.advisor) q = q.eq('user_id', params.advisor)
  if (params.assignee === 'unassigned') q = q.is('assigned_to', null)
  else if (params.assignee) q = q.eq('assigned_to', params.assignee)
  if (params.q) q = q.ilike('subject', `%${params.q}%`)

  const { data: ticketRows } = await q
  const tickets = (ticketRows ?? []) as SupportTicket[]

  // Pre-compute aggregate counts (BEFORE filters) for the header chips
  // Just one extra round-trip to count by status without filters
  const { data: allForCount } = await supabase.from('support_tickets').select('status')
  const counts: Record<SupportStatus, number> = { open: 0, in_progress: 0, waiting_on_user: 0, resolved: 0, closed: 0 }
  for (const r of (allForCount ?? []) as Array<{ status: SupportStatus }>) {
    counts[r.status] = (counts[r.status] ?? 0) + 1
  }

  // Resolve advisor + client names in batch
  const userIds = new Set<string>()
  const clientIds = new Set<string>()
  for (const t of tickets) {
    userIds.add(t.user_id)
    if (t.assigned_to) userIds.add(t.assigned_to)
    if (t.client_id) clientIds.add(t.client_id)
  }
  const profileMap = await fetchProfilesByIds(supabase, Array.from(userIds))
  const clientMap = new Map<string, string>()
  if (clientIds.size > 0) {
    const { data: clients } = await supabase.from('clients').select('id, name').in('id', Array.from(clientIds))
    for (const c of (clients ?? []) as Array<{ id: string; name: string }>) clientMap.set(c.id, c.name)
  }

  // Comment counts per ticket (cheap aggregate)
  const ticketIds = tickets.map((t) => t.id)
  const commentCounts = new Map<string, number>()
  if (ticketIds.length > 0) {
    const { data: countsData } = await supabase
      .from('support_ticket_comments')
      .select('ticket_id')
      .in('ticket_id', ticketIds)
    for (const r of (countsData ?? []) as Array<{ ticket_id: string }>) {
      commentCounts.set(r.ticket_id, (commentCounts.get(r.ticket_id) ?? 0) + 1)
    }
  }

  // Build advisor and admin lists for filter dropdowns
  // Pull all advisors who have ever submitted a ticket + all admin profiles
  const { data: allAdvisorTickets } = await supabase.from('support_tickets').select('user_id')
  const advisorIdSet = new Set<string>(((allAdvisorTickets ?? []) as Array<{ user_id: string }>).map((r) => r.user_id))
  const { data: adminProfiles } = await supabase.from('profiles').select('id, email, role').eq('role', 'admin')
  const adminIds = ((adminProfiles ?? []) as Array<{ id: string }>).map((p) => p.id)
  const advisorAndAdminProfiles = await fetchProfilesByIds(
    supabase,
    Array.from(new Set<string>([...Array.from(advisorIdSet), ...adminIds]))
  )

  const advisors = Array.from(advisorIdSet).map((id) => ({
    id,
    name: profileDisplayName(advisorAndAdminProfiles.get(id)),
  })).sort((a, b) => a.name.localeCompare(b.name))
  const admins = adminIds.map((id) => ({
    id,
    name: profileDisplayName(advisorAndAdminProfiles.get(id)),
  })).sort((a, b) => a.name.localeCompare(b.name))

  const enrichedTickets = tickets.map((t) => ({
    ...t,
    advisorName: profileDisplayName(profileMap.get(t.user_id)),
    clientName: t.client_id ? clientMap.get(t.client_id) ?? null : null,
    commentCount: commentCounts.get(t.id) ?? 0,
  }))

  return (
    <div>
      <div className="flex items-start justify-between gap-6 mb-8">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-accent border border-gold-border">
            <LifeBuoy className="h-6 w-6 text-gold" />
          </div>
          <div>
            <h1 className="text-[28px] font-display font-bold text-foreground leading-tight">Support Centre</h1>
            <p className="text-sm text-text-dim mt-0.5">
              {counts.open} open · {counts.in_progress} in progress · {counts.waiting_on_user} waiting · {counts.resolved + counts.closed} done
            </p>
          </div>
        </div>
        <ViewToggle current={view} />
      </div>

      <div className="mb-5">
        <AdminFilterBar advisors={advisors} admins={admins} />
      </div>

      {view === 'kanban' ? (
        <KanbanBoard tickets={enrichedTickets} />
      ) : (
        <div className="rounded-[14px] border border-border-default bg-bg-card overflow-hidden">
          {enrichedTickets.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-text-dim">No tickets match these filters.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[rgba(255,255,255,0.02)] border-b border-border-default">
                <tr className="text-left text-xs uppercase tracking-wider text-text-dimmer">
                  <th className="px-4 py-2.5 font-semibold">Subject</th>
                  <th className="px-4 py-2.5 font-semibold">Advisor</th>
                  <th className="px-4 py-2.5 font-semibold">Client</th>
                  <th className="px-4 py-2.5 font-semibold">Severity</th>
                  <th className="px-4 py-2.5 font-semibold">Priority</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody>
                {enrichedTickets.map((t) => (
                  <tr key={t.id} className="border-b border-border-default last:border-b-0 hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/support-centre/${t.id}`} className="text-foreground hover:text-gold font-medium">
                        {t.subject}
                      </Link>
                      {t.commentCount > 0 && (
                        <span className="ml-2 text-xs text-text-dimmer">· {t.commentCount} {t.commentCount === 1 ? 'reply' : 'replies'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-dim">{t.advisorName}</td>
                    <td className="px-4 py-3 text-text-dim">{t.clientName ?? '—'}</td>
                    <td className="px-4 py-3"><SeverityBadge severity={t.severity as SupportSeverity} /></td>
                    <td className="px-4 py-3"><PriorityBadge priority={t.priority as SupportPriority} /></td>
                    <td className="px-4 py-3"><StatusBadge status={t.status as SupportStatus} /></td>
                    <td className="px-4 py-3 text-text-dim text-xs">{formatRelative(t.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
