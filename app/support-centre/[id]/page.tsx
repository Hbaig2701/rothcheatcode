import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ChevronLeft, LifeBuoy, Calendar, User as UserIcon, Folder } from 'lucide-react'
import { CommentThread } from '@/components/support/comment-thread'
import { AttachmentList } from '@/components/support/attachment-list'
import { AdminTicketControls } from '@/components/support/admin-ticket-controls'
import { SeverityBadge } from '@/components/support/status-badge'
import { DeleteTicketButton } from '@/components/support/delete-ticket-button'
import { LinkifiedText } from '@/components/support/linkified-text'
import { LocalTime } from '@/components/support/local-time'
import {
  fetchTicketWithRelations,
  fetchProfilesByIds,
  profileDisplayName,
  profileInitial,
} from '@/lib/queries/support'
import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  PRIORITY_LABELS,
  type SupportCategory,
  type SupportStatus,
  type SupportPriority,
} from '@/lib/types/support'

function eventLabel(event_type: string, oldValue: string | null, newValue: string | null) {
  if (event_type === 'status_change') return `Status changed: ${STATUS_LABELS[oldValue as SupportStatus] ?? oldValue} → ${STATUS_LABELS[newValue as SupportStatus] ?? newValue}`
  if (event_type === 'priority_change') return `Priority changed: ${PRIORITY_LABELS[oldValue as SupportPriority] ?? oldValue} → ${PRIORITY_LABELS[newValue as SupportPriority] ?? newValue}`
  if (event_type === 'assigned') return newValue ? `Assigned` : 'Unassigned'
  if (event_type === 'comment_added') return 'Replied'
  if (event_type === 'internal_comment_added') return 'Added internal note'
  return event_type
}

export default async function AdminTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user: viewer } } = await supabase.auth.getUser()

  const { ticket, comments, attachments, events } = await fetchTicketWithRelations(supabase, id)
  if (!ticket) notFound()

  // Clear any unread "advisor replied" bell notifications for this admin on
  // this ticket — opening the page is the equivalent of acknowledging them.
  // Best-effort: a failed update must never block rendering.
  if (viewer) {
    void supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', viewer.id)
      .eq('type', 'support_ticket_reply')
      .eq('related_id', id)
      .eq('is_read', false)
  }

  // Resolve all involved user_ids
  const userIds = new Set<string>([ticket.user_id])
  if (ticket.assigned_to) userIds.add(ticket.assigned_to)
  for (const c of comments) userIds.add(c.user_id)
  for (const e of events) userIds.add(e.user_id)

  // Also fetch the full admin list for the assignee dropdown
  const { data: adminProfiles } = await supabase.from('profiles').select('id').eq('role', 'admin')
  for (const p of (adminProfiles ?? []) as Array<{ id: string }>) userIds.add(p.id)

  const profiles = await fetchProfilesByIds(supabase, Array.from(userIds))

  let clientName: string | null = null
  if (ticket.client_id) {
    const { data: c } = await supabase.from('clients').select('name').eq('id', ticket.client_id).maybeSingle()
    clientName = (c?.name as string | undefined) ?? null
  }

  const advisorProfile = profiles.get(ticket.user_id)
  const adminsForDropdown = ((adminProfiles ?? []) as Array<{ id: string }>).map((p) => ({
    id: p.id,
    name: profileDisplayName(profiles.get(p.id)),
  })).sort((a, b) => a.name.localeCompare(b.name))

  const enrichedComments = comments.map((c) => {
    const p = profiles.get(c.user_id)
    return {
      ...c,
      author: {
        id: c.user_id,
        name: profileDisplayName(p),
        initial: profileInitial(p),
        isAdmin: p?.role === 'admin',
      },
    }
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/support-centre"
          className="inline-flex items-center gap-1 text-sm text-text-dim hover:text-foreground transition-colors"
        >
          <ChevronLeft className="size-4" />
          Back to Support Centre
        </Link>
        <DeleteTicketButton ticketId={ticket.id} subject={ticket.subject} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div>
          <div className="flex items-start gap-4 mb-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-accent border border-gold-border shrink-0">
              <LifeBuoy className="h-6 w-6 text-gold" />
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-text-dimmer font-semibold mb-1">
                {CATEGORY_LABELS[ticket.category as SupportCategory]}
              </p>
              <h1 className="text-2xl font-display font-bold text-foreground leading-tight">{ticket.subject}</h1>
              <p className="text-sm text-text-dim mt-1">
                Submitted by {profileDisplayName(advisorProfile)}{advisorProfile?.email && ` (${advisorProfile.email})`} · <LocalTime iso={ticket.created_at} format="date-time" />
              </p>
              <p className="text-sm text-text-dim mt-1">
                <span className="text-text-dimmer">Re: </span>
                {clientName && ticket.client_id ? (
                  <Link href={`/clients/${ticket.client_id}`} className="text-foreground hover:text-gold transition-colors font-medium">{clientName}</Link>
                ) : (
                  <span className="text-text-dimmer italic">No client linked</span>
                )}
              </p>
            </div>
          </div>

          <div className="rounded-[14px] bg-bg-card border border-border-default p-6 mb-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dimmer mb-3">Description</h2>
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              <LinkifiedText>{ticket.description}</LinkifiedText>
            </p>
          </div>

          <div className="rounded-[14px] bg-bg-card border border-border-default p-6 mb-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dimmer mb-3">Attachments</h2>
            <AttachmentList ticketId={ticket.id} attachments={attachments} />
          </div>

          <div className="rounded-[14px] bg-bg-card border border-border-default p-6 mb-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dimmer mb-3">Conversation</h2>
            <CommentThread ticketId={ticket.id} comments={enrichedComments} canPostInternal={true} currentUserId={viewer?.id ?? ''} />
          </div>

          {events.length > 0 && (
            <div className="rounded-[14px] bg-bg-card border border-border-default p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dimmer mb-3">Activity</h2>
              <ul className="space-y-1.5 text-xs">
                {events.map((e) => {
                  const author = profiles.get(e.user_id)
                  return (
                    <li key={e.id} className="text-text-dim">
                      <span className="text-foreground">{profileDisplayName(author)}</span>
                      <span> {eventLabel(e.event_type, e.old_value, e.new_value).replace(/^([A-Z])/, (m) => m.toLowerCase())}</span>
                      <span className="text-text-dimmer"> · <LocalTime iso={e.created_at} format="date-time" /></span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>

        {/* Side panel */}
        <aside className="space-y-4">
          <div className="rounded-[14px] bg-bg-card border border-border-default p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-text-dimmer mb-4">Admin Controls</h3>
            <AdminTicketControls
              ticketId={ticket.id}
              status={ticket.status as SupportStatus}
              priority={ticket.priority as SupportPriority}
              assignedTo={ticket.assigned_to}
              admins={adminsForDropdown}
              layout="stacked"
            />
          </div>

          <div className="rounded-[14px] bg-bg-card border border-border-default p-5 space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-text-dimmer">Details</h3>
            <div>
              <div className="flex items-center gap-1.5 text-xs text-text-dimmer mb-1">
                <UserIcon className="size-3.5" />
                <span>Advisor</span>
              </div>
              <p className="text-sm text-foreground">{profileDisplayName(advisorProfile)}</p>
              {advisorProfile?.email && (
                <p className="text-xs text-text-dim">{advisorProfile.email}</p>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-xs text-text-dimmer mb-1">
                <Folder className="size-3.5" />
                <span>Severity</span>
              </div>
              <SeverityBadge severity={ticket.severity} />
            </div>
            {clientName && (
              <div>
                <div className="flex items-center gap-1.5 text-xs text-text-dimmer mb-1">
                  <UserIcon className="size-3.5" />
                  <span>Related Client</span>
                </div>
                <Link href={`/clients/${ticket.client_id}`} className="text-sm text-foreground hover:text-gold transition-colors">{clientName}</Link>
              </div>
            )}
            <div>
              <div className="flex items-center gap-1.5 text-xs text-text-dimmer mb-1">
                <Calendar className="size-3.5" />
                <span>Last Updated</span>
              </div>
              <p className="text-sm text-foreground"><LocalTime iso={ticket.updated_at} format="date-time" /></p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
