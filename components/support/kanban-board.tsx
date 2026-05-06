'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SeverityBadge, PriorityBadge } from '@/components/support/status-badge'
import {
  SUPPORT_STATUSES,
  STATUS_LABELS,
  type SupportStatus,
  type SupportTicket,
} from '@/lib/types/support'

interface KanbanTicket extends SupportTicket {
  advisorName: string
  clientName: string | null
  commentCount: number
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
                  className="rounded-[10px] border border-border-default bg-bg-card p-3 hover:border-gold-border transition-colors"
                >
                  <Link href={`/support-centre/${t.id}`} className="block mb-2">
                    <p className="text-sm font-medium text-foreground line-clamp-2">{t.subject}</p>
                  </Link>
                  <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                    <PriorityBadge priority={t.priority} />
                    <SeverityBadge severity={t.severity} />
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
