'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Flag, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SeverityBadge, PriorityBadge } from '@/components/support/status-badge'
import {
  SUPPORT_STATUSES,
  STATUS_LABELS,
  type SupportStatus,
  type SupportPriority,
  type SupportTicket,
} from '@/lib/types/support'

interface KanbanTicket extends SupportTicket {
  advisorName: string
  clientName: string | null
  commentCount: number
  hasUnread: boolean
}

const COLUMNS: { status: SupportStatus; accent: string }[] = [
  { status: 'open', accent: 'border-blue-500/40' },
  { status: 'in_progress', accent: 'border-yellow-500/40' },
  { status: 'waiting_on_user', accent: 'border-purple-500/40' },
  { status: 'resolved', accent: 'border-emerald-500/40' },
  { status: 'closed', accent: 'border-slate-500/40' },
]

function formatRelative(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days < 1) return 'today'
  if (days === 1) return '1d'
  if (days < 30) return `${days}d`
  return `${Math.floor(days / 30)}mo`
}

// Flag-to-prioritize: clicking the flag cycles the ticket's priority so the
// admin can mark what they need to work on. high -> orange card, urgent -> red.
// A third click clears it back to the default (medium).
function nextPriority(p: SupportPriority): SupportPriority {
  if (p === 'high') return 'urgent'
  if (p === 'urgent') return 'medium'
  return 'high'
}

// Orange for high, red for urgent — applied to the card border + a light fill so
// flagged tickets jump out of the board.
function priorityHighlight(p: SupportPriority): string | null {
  if (p === 'urgent') return 'border-red-500 bg-red-500/[0.06] dark:bg-red-500/10'
  if (p === 'high') return 'border-orange-500 bg-orange-500/[0.07] dark:bg-orange-500/10'
  return null
}

export function KanbanBoard({ tickets }: { tickets: KanbanTicket[] }) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const grouped = new Map<SupportStatus, KanbanTicket[]>()
  for (const s of SUPPORT_STATUSES) grouped.set(s, [])
  for (const t of tickets) grouped.get(t.status)?.push(t)

  async function changeStatus(id: string, status: SupportStatus) {
    setPendingId(id)
    const res = await fetch(`/api/support-tickets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setPendingId(null)
    if (res.ok) router.refresh()
  }

  async function changePriority(id: string, priority: SupportPriority) {
    setPendingId(id)
    const res = await fetch(`/api/support-tickets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority }),
    })
    setPendingId(null)
    if (res.ok) router.refresh()
  }

  return (
    <div className="grid gap-3 lg:grid-cols-5 md:grid-cols-3 sm:grid-cols-2">
      {COLUMNS.map((col) => {
        const items = grouped.get(col.status) ?? []
        return (
          <div
            key={col.status}
            className={cn(
              'rounded-[12px] border bg-bg-card/50 p-3 min-h-[200px]',
              col.accent
            )}
          >
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-foreground/85">
                {STATUS_LABELS[col.status]}
              </span>
              <span className="text-xs text-text-dimmer">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    'rounded-[10px] border bg-bg-card p-3 hover:border-gold-border transition-colors',
                    // Priority flag (orange/red) wins over the unread highlight so
                    // the tickets the admin flagged to work on stand out most.
                    priorityHighlight(t.priority) ?? (t.hasUnread ? 'border-gold/60 bg-gold/[0.04]' : 'border-border-default')
                  )}
                >
                  <div className="flex items-start gap-2 mb-2">
                    <Link href={`/support-centre/${t.id}`} className="block flex-1 min-w-0">
                      <div className="flex items-start gap-2">
                        {t.hasUnread && (
                          <span
                            className="mt-1.5 size-2 shrink-0 rounded-full bg-gold"
                            aria-label="Unread reply"
                          />
                        )}
                        <p className={cn(
                          'text-sm line-clamp-2',
                          t.hasUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground'
                        )}>{t.subject}</p>
                      </div>
                    </Link>
                    <button
                      type="button"
                      onClick={() => changePriority(t.id, nextPriority(t.priority))}
                      disabled={pendingId === t.id}
                      title="Flag priority — click to cycle High (orange) → Urgent (red) → clear"
                      aria-label="Flag priority"
                      className={cn(
                        'shrink-0 rounded p-1 -mt-0.5 -mr-1 transition-colors',
                        t.priority === 'urgent' ? 'text-red-500' :
                        t.priority === 'high' ? 'text-orange-500' :
                        'text-text-dimmer hover:text-foreground'
                      )}
                    >
                      <Flag
                        className="size-3.5"
                        fill={t.priority === 'high' || t.priority === 'urgent' ? 'currentColor' : 'none'}
                      />
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                    <PriorityBadge priority={t.priority} />
                    <SeverityBadge severity={t.severity} />
                    {t.hasUnread && (
                      <span className="inline-flex items-center rounded-full bg-gold/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gold">
                        New reply
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-text-dim space-y-0.5">
                    <p className="truncate">{t.advisorName}</p>
                    {t.clientName && <p className="truncate text-text-dimmer">re: {t.clientName}</p>}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-text-dimmer">{formatRelative(t.created_at)}</span>
                      {t.commentCount > 0 && (
                        <span className="text-text-dimmer">{t.commentCount} {t.commentCount === 1 ? 'reply' : 'replies'}</span>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-border-default/50 relative">
                    <select
                      value={t.status}
                      onChange={(e) => changeStatus(t.id, e.target.value as SupportStatus)}
                      disabled={pendingId === t.id}
                      className="w-full h-7 rounded border border-border bg-white dark:bg-input/30 px-2 text-xs"
                    >
                      {SUPPORT_STATUSES.map((s) => (
                        <option key={s} value={s}>Move to: {STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                    {pendingId === t.id && <Loader2 className="absolute right-2 top-2 size-3.5 animate-spin text-text-dim" />}
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <p className="text-xs text-text-dimmer italic px-1 py-3">No tickets</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
