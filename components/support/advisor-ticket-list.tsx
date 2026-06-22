'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { StatusBadge, SeverityBadge } from '@/components/support/status-badge'
import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  type SupportTicket,
  type SupportCategory,
  type SupportStatus,
} from '@/lib/types/support'

export interface AdvisorTicket extends SupportTicket {
  hasUnread: boolean
}

const OPEN_STATUSES: SupportStatus[] = ['open', 'in_progress', 'waiting_on_user']

function formatRelative(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days < 1) return 'today'
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  return months === 1 ? '1 month ago' : `${months} months ago`
}

function recency(t: AdvisorTicket) {
  return new Date(t.updated_at ?? t.created_at).getTime()
}

function TicketCard({ t, muted = false }: { t: AdvisorTicket; muted?: boolean }) {
  return (
    <Link
      href={`/support/${t.id}`}
      className={cn(
        'block rounded-[12px] border px-5 py-4 transition-colors hover:border-gold-border',
        t.hasUnread
          ? 'bg-gold/[0.06] border-gold/50'
          : muted
            ? 'bg-bg-card/50 border-border-default/60'
            : 'bg-bg-card border-border-default'
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {t.hasUnread && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-gold">
                <span className="size-1.5 rounded-full bg-gold" />
                New reply
              </span>
            )}
            <span className="text-xs uppercase tracking-wider text-text-dimmer font-semibold">
              {CATEGORY_LABELS[t.category as SupportCategory]}
            </span>
            <span className="text-xs text-text-dimmer">·</span>
            <span className="text-xs text-text-dimmer">{formatRelative(t.created_at)}</span>
          </div>
          <p className={cn('text-base truncate', t.hasUnread ? 'font-semibold text-foreground' : 'font-medium', muted && !t.hasUnread ? 'text-text-dim' : 'text-foreground')}>
            {t.subject}
          </p>
          <p className="text-sm text-text-dim mt-1 line-clamp-2">{t.description}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <StatusBadge status={t.status} />
          <SeverityBadge severity={t.severity} />
        </div>
      </div>
    </Link>
  )
}

export function AdvisorTicketList({ tickets }: { tickets: AdvisorTicket[] }) {
  const [filter, setFilter] = useState<'all' | SupportStatus>('all')

  const open = tickets.filter((t) => OPEN_STATUSES.includes(t.status))
  const closed = tickets
    .filter((t) => t.status === 'resolved' || t.status === 'closed')
    .sort((a, b) => recency(b) - recency(a))

  // Unread first, then most-recent activity.
  const sortedOpen = [...open].sort(
    (a, b) => (b.hasUnread ? 1 : 0) - (a.hasUnread ? 1 : 0) || recency(b) - recency(a)
  )
  const visibleOpen = filter === 'all' ? sortedOpen : sortedOpen.filter((t) => t.status === filter)

  // Status filter pills — only show a status that actually has open tickets.
  const statusFilters = OPEN_STATUSES.filter((s) => open.some((t) => t.status === s))
  const showFilters = statusFilters.length > 1

  return (
    <div className="space-y-9">
      {/* ===== Open / active tickets ===== */}
      <section>
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <h2 className="text-sm font-semibold text-foreground">
            Active tickets <span className="text-text-dimmer font-normal">({open.length})</span>
          </h2>
          {showFilters && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <FilterPill active={filter === 'all'} onClick={() => setFilter('all')} label="All" count={open.length} />
              {statusFilters.map((s) => (
                <FilterPill
                  key={s}
                  active={filter === s}
                  onClick={() => setFilter(s)}
                  label={STATUS_LABELS[s]}
                  count={open.filter((t) => t.status === s).length}
                />
              ))}
            </div>
          )}
        </div>

        {visibleOpen.length === 0 ? (
          <div className="rounded-[12px] border border-dashed border-border-default px-5 py-8 text-center text-sm text-text-dim">
            {open.length === 0 ? 'No active tickets — you’re all caught up.' : 'No tickets match this filter.'}
          </div>
        ) : (
          <div className="space-y-2.5">
            {visibleOpen.map((t) => (
              <TicketCard key={t.id} t={t} />
            ))}
          </div>
        )}
      </section>

      {/* ===== Closed / resolved (greyed, at the bottom) ===== */}
      {closed.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-wider font-semibold text-text-dimmer mb-3">
            Closed &amp; resolved ({closed.length})
          </h2>
          <div className="space-y-2.5 opacity-65">
            {closed.map((t) => (
              <TicketCard key={t.id} t={t} muted />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function FilterPill({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-gold-border bg-gold/15 text-foreground'
          : 'border-border-default text-text-dim hover:text-foreground hover:border-gold-border'
      )}
    >
      {label}
      <span className={cn('text-[11px]', active ? 'text-gold' : 'text-text-dimmer')}>{count}</span>
    </button>
  )
}
