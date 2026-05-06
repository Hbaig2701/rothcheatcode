import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { LifeBuoy, Plus, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge, SeverityBadge } from '@/components/support/status-badge'
import { CATEGORY_LABELS, type SupportTicket, type SupportCategory } from '@/lib/types/support'

function formatRelative(iso: string) {
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const days = Math.floor(diffMs / 86_400_000)
  if (days < 1) return 'today'
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  if (months === 1) return '1 month ago'
  return `${months} months ago`
}

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
        <div className="space-y-2.5">
          {list.map((t) => (
            <Link
              key={t.id}
              href={`/support/${t.id}`}
              className="block rounded-[12px] bg-bg-card border border-border-default px-5 py-4 transition-colors hover:border-gold-border"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs uppercase tracking-wider text-text-dimmer font-semibold">
                      {CATEGORY_LABELS[t.category as SupportCategory]}
                    </span>
                    <span className="text-xs text-text-dimmer">·</span>
                    <span className="text-xs text-text-dimmer">{formatRelative(t.created_at)}</span>
                  </div>
                  <p className="text-base font-medium text-foreground truncate">{t.subject}</p>
                  <p className="text-sm text-text-dim mt-1 line-clamp-2">{t.description}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <StatusBadge status={t.status} />
                  <SeverityBadge severity={t.severity} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
