import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { LifeBuoy, Plus, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { type SupportTicket } from '@/lib/types/support'
import { AdvisorTicketList, type AdvisorTicket } from '@/components/support/advisor-ticket-list'

export default async function SupportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: tickets } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const list = (tickets ?? []) as SupportTicket[]
  const openCount = list.filter((t) => t.status !== 'closed' && t.status !== 'resolved').length

  // Per-ticket "new reply" alert: tickets with an unread support-reply
  // notification for this advisor. We deliberately do NOT bulk-clear here any
  // more — the alert should persist on the list until the advisor opens the
  // specific ticket (the detail page clears that ticket's notification).
  const unreadTicketIds = new Set<string>()
  const ticketIds = list.map((t) => t.id)
  if (ticketIds.length > 0) {
    const { data: unreadRows } = await supabase
      .from('notifications')
      .select('related_id')
      .eq('user_id', user.id)
      .eq('type', 'support_ticket_reply')
      .eq('is_read', false)
      .in('related_id', ticketIds)
    for (const r of (unreadRows ?? []) as Array<{ related_id: string | null }>) {
      if (r.related_id) unreadTicketIds.add(r.related_id)
    }
  }
  const enriched: AdvisorTicket[] = list.map((t) => ({ ...t, hasUnread: unreadTicketIds.has(t.id) }))

  return (
    <div className="p-10 max-w-6xl">
      <div className="flex items-start justify-between gap-6 mb-8">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-accent border border-gold-border">
            <LifeBuoy className="h-6 w-6 text-gold" />
          </div>
          <div>
            <h1 className="text-[28px] font-display font-bold text-foreground leading-tight">Support</h1>
            <p className="text-base text-text-dim mt-0.5">
              {openCount > 0
                ? `${openCount} active ${openCount === 1 ? 'ticket' : 'tickets'} — we'll get back to you soon`
                : 'Submit a ticket and our team will get back to you'}
            </p>
          </div>
        </div>
        <Button render={<Link href="/support/new" />}>
          <Plus className="size-4" />
          New ticket
        </Button>
      </div>

      {list.length === 0 ? (
        <div className="rounded-[14px] bg-bg-card border border-border-default px-8 py-16 text-center">
          <MessageSquare className="mx-auto size-10 text-text-dimmer mb-4" />
          <p className="text-foreground font-medium mb-1">No tickets yet</p>
          <p className="text-sm text-text-dim mb-6">Have an issue with a client report or a feature request?</p>
          <Button render={<Link href="/support/new" />}>
            <Plus className="size-4" />
            Submit your first ticket
          </Button>
        </div>
      ) : (
        <AdvisorTicketList tickets={enriched} />
      )}
    </div>
  )
}
