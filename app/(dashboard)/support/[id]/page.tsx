import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ChevronLeft, LifeBuoy, Calendar, User as UserIcon, Folder } from 'lucide-react'
import { StatusBadge, SeverityBadge } from '@/components/support/status-badge'
import { CommentThread } from '@/components/support/comment-thread'
import { AttachmentList } from '@/components/support/attachment-list'
import { ReopenButton } from '@/components/support/reopen-button'
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
  type SupportCategory,
  type SupportStatus,
} from '@/lib/types/support'
import { createNotification } from '@/lib/notifications/create'

export default async function SupportTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { ticket, comments, attachments, events } = await fetchTicketWithRelations(supabase, id)
  if (!ticket) notFound()

  // Clear unread support notifications for this ticket — opening the page
  // means the advisor has seen the activity. Mirrors the admin-side detail
  // page behavior. Best-effort: a failed update must never block rendering.
  void supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('related_id', id)
    .eq('is_read', false)
    .in('type', ['support_ticket_reply', 'support_ticket_status_change'])

  // Log a ticket_viewed event for the admin "Today" timeline so support can
  // see when an advisor has actually read their own ticket (not just filed
  // it), AND fan out a notification to every admin so the support-centre
  // bell pings when an advisor opens their ticket — useful for confirming
  // "did the advisor see my reply yet?" without having to check the
  // timeline. Only fires when the ticket owner is the viewer — admins
  // peeking at this route shouldn't generate phantom events or notifications.
  // Throttled to once every 5 minutes per (user, ticket) so a page refresh
  // doesn't spam the events table OR the admin bell.
  if (ticket.user_id === user.id) {
    const fiveMinAgoIso = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { data: recentView } = await supabase
      .from('support_ticket_events')
      .select('id')
      .eq('ticket_id', id)
      .eq('user_id', user.id)
      .eq('event_type', 'ticket_viewed')
      .gte('created_at', fiveMinAgoIso)
      .limit(1)
      .maybeSingle()
    if (!recentView) {
      void supabase.from('support_ticket_events').insert({
        ticket_id: id,
        user_id: user.id,
        event_type: 'ticket_viewed',
        old_value: null,
        new_value: null,
      })

      // Notify every admin. Pull the advisor's display name from
      // user_settings (falls back to email) for a useful title. Best-effort
      // — every step is wrapped so a notification failure can never block
      // the ticket page from rendering.
      void (async () => {
        try {
          // The admins lookup MUST go through the admin client. This code
          // path runs from the advisor's session (ticket owner viewing own
          // ticket), so RLS would block the regular client from seeing
          // other users' profiles - returning an empty admin list and
          // silently dropping every fan-out notification.
          const adminClient = createAdminClient()
          const [settingsRes, adminsRes] = await Promise.all([
            supabase.from('user_settings').select('first_name, last_name').eq('user_id', user.id).maybeSingle(),
            adminClient.from('profiles').select('id').eq('role', 'admin'),
          ])
          const namePart = [settingsRes.data?.first_name, settingsRes.data?.last_name]
            .filter(Boolean)
            .join(' ')
            .trim()
          const advisorName = namePart || user.email || 'An advisor'
          const admins = (adminsRes.data ?? []) as Array<{ id: string }>
          await Promise.all(
            admins.map((a) =>
              createNotification({
                user_id: a.id,
                type: 'support_ticket_viewed',
                title: `${advisorName} opened their ticket`,
                body: `Re: ${ticket.subject}`,
                // Admin clicks the bell -> lands on the admin-side route,
                // not the advisor-facing /support-centre/${id}.
                link_url: `/support/${id}`,
                related_id: id,
              })
            )
          )
        } catch (err) {
          console.error('[support-ticket-view] admin notification fan-out failed', err)
        }
      })()
    }
  }

  // Look up authors for comments + status events
  const userIds = new Set<string>([ticket.user_id])
  for (const c of comments) userIds.add(c.user_id)
  for (const e of events) userIds.add(e.user_id)
  const profiles = await fetchProfilesByIds(supabase, Array.from(userIds))

  // Optional: client name
  let clientName: string | null = null
  if (ticket.client_id) {
    const { data: c } = await supabase.from('clients').select('name').eq('id', ticket.client_id).maybeSingle()
    clientName = (c?.name as string | undefined) ?? null
  }

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

  const isClosed = ticket.status === 'closed' || ticket.status === 'resolved'
  const statusEvents = events.filter((e) => e.event_type === 'status_change')

  return (
    <div className="p-10 max-w-4xl">
      <Link
        href="/support"
        className="inline-flex items-center gap-1 text-sm text-text-dim hover:text-foreground mb-6 transition-colors"
      >
        <ChevronLeft className="size-4" />
        Back to Support
      </Link>

      <div className="flex items-start justify-between gap-6 mb-6">
        <div className="flex items-start gap-4 min-w-0 flex-1">
          <div className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-accent border border-gold-border shrink-0">
            <LifeBuoy className="h-6 w-6 text-gold" />
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-text-dimmer font-semibold mb-1">
              {CATEGORY_LABELS[ticket.category as SupportCategory]}
            </p>
            <h1 className="text-2xl font-display font-bold text-foreground leading-tight">{ticket.subject}</h1>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <StatusBadge status={ticket.status} />
          <SeverityBadge severity={ticket.severity} />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3 mb-6">
        <div className="rounded-[10px] border border-border-default bg-bg-card px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs text-text-dimmer mb-1">
            <Calendar className="size-3.5" />
            <span>Submitted</span>
          </div>
          <p className="text-sm text-foreground"><LocalTime iso={ticket.created_at} format="date-time" /></p>
        </div>
        <div className="rounded-[10px] border border-border-default bg-bg-card px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs text-text-dimmer mb-1">
            <UserIcon className="size-3.5" />
            <span>Related Client</span>
          </div>
          <p className="text-sm text-foreground">
            {clientName ? (
              <Link href={`/clients/${ticket.client_id}`} className="hover:text-gold transition-colors">{clientName}</Link>
            ) : (
              <span className="text-text-dim">None</span>
            )}
          </p>
        </div>
        <div className="rounded-[10px] border border-border-default bg-bg-card px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs text-text-dimmer mb-1">
            <Folder className="size-3.5" />
            <span>Last Updated</span>
          </div>
          <p className="text-sm text-foreground"><LocalTime iso={ticket.updated_at} format="date-time" /></p>
        </div>
      </div>

      {isClosed && (
        <div className="rounded-[10px] border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 mb-6 flex items-center justify-between">
          <p className="text-sm text-foreground">
            This ticket is {ticket.status === 'resolved' ? 'marked resolved' : 'closed'}. If you still need help, you can re-open it.
          </p>
          <ReopenButton ticketId={ticket.id} />
        </div>
      )}

      <div className="rounded-[14px] bg-bg-card border border-border-default p-6 mb-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dimmer mb-3">Description</h2>
        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
          <LinkifiedText>{ticket.description}</LinkifiedText>
        </p>
      </div>

      <div className="rounded-[14px] bg-bg-card border border-border-default p-6 mb-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dimmer mb-3">Attachments</h2>
        <AttachmentList ticketId={ticket.id} attachments={attachments.filter(a => !a.comment_id)} />
      </div>

      {statusEvents.length > 0 && (
        <div className="rounded-[14px] bg-bg-card border border-border-default p-6 mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dimmer mb-3">Status timeline</h2>
          <ul className="space-y-1.5 text-sm">
            {statusEvents.map((e) => (
              <li key={e.id} className="text-text-dim">
                <span className="text-foreground font-medium">{STATUS_LABELS[e.new_value as SupportStatus] ?? e.new_value}</span>
                <span className="text-text-dimmer"> — <LocalTime iso={e.created_at} format="date-time" /></span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-[14px] bg-bg-card border border-border-default p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dimmer mb-3">Conversation</h2>
        <CommentThread
          ticketId={ticket.id}
          comments={enrichedComments}
          commentAttachments={attachments.filter(a => a.comment_id)}
          canPostInternal={false}
          currentUserId={user.id}
        />
      </div>
    </div>
  )
}
