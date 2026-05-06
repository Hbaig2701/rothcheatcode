import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ChevronLeft, LifeBuoy, Calendar, User as UserIcon, Folder } from 'lucide-react'
import { StatusBadge, SeverityBadge } from '@/components/support/status-badge'
import { CommentThread } from '@/components/support/comment-thread'
import { AttachmentList } from '@/components/support/attachment-list'
import { ReopenButton } from '@/components/support/reopen-button'
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default async function SupportTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { ticket, comments, attachments, events } = await fetchTicketWithRelations(supabase, id)
  if (!ticket) notFound()

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
          <p className="text-sm text-foreground">{formatDate(ticket.created_at)}</p>
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
          <p className="text-sm text-foreground">{formatDate(ticket.updated_at)}</p>
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
        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{ticket.description}</p>
      </div>

      <div className="rounded-[14px] bg-bg-card border border-border-default p-6 mb-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dimmer mb-3">Attachments</h2>
        <AttachmentList ticketId={ticket.id} attachments={attachments} />
      </div>

      {statusEvents.length > 0 && (
        <div className="rounded-[14px] bg-bg-card border border-border-default p-6 mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dimmer mb-3">Status timeline</h2>
          <ul className="space-y-1.5 text-sm">
            {statusEvents.map((e) => (
              <li key={e.id} className="text-text-dim">
                <span className="text-foreground font-medium">{STATUS_LABELS[e.new_value as SupportStatus] ?? e.new_value}</span>
                <span className="text-text-dimmer"> — {formatDate(e.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-[14px] bg-bg-card border border-border-default p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dimmer mb-3">Conversation</h2>
        <CommentThread ticketId={ticket.id} comments={enrichedComments} canPostInternal={false} />
      </div>
    </div>
  )
}
