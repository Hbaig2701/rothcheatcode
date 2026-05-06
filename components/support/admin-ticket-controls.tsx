'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import {
  SUPPORT_STATUSES,
  SUPPORT_PRIORITIES,
  STATUS_LABELS,
  PRIORITY_LABELS,
  type SupportStatus,
  type SupportPriority,
} from '@/lib/types/support'

interface AdminProfileLite {
  id: string
  name: string
}

interface AdminTicketControlsProps {
  ticketId: string
  status: SupportStatus
  priority: SupportPriority
  assignedTo: string | null
  admins: AdminProfileLite[]
  layout?: 'inline' | 'stacked'
}

export function AdminTicketControls({
  ticketId,
  status,
  priority,
  assignedTo,
  admins,
  layout = 'inline',
}: AdminTicketControlsProps) {
  const router = useRouter()
  const [pending, setPending] = useState<string | null>(null)
  const [localStatus, setLocalStatus] = useState(status)
  const [localPriority, setLocalPriority] = useState(priority)
  const [localAssignee, setLocalAssignee] = useState(assignedTo ?? '')

  async function patch(field: 'status' | 'priority' | 'assigned_to', value: string | null) {
    setPending(field)
    const body: Record<string, unknown> = {}
    body[field] = value === '' ? null : value
    const res = await fetch(`/api/support-tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setPending(null)
    if (!res.ok) {
      // Revert local state on error
      if (field === 'status') setLocalStatus(status)
      if (field === 'priority') setLocalPriority(priority)
      if (field === 'assigned_to') setLocalAssignee(assignedTo ?? '')
      return
    }
    router.refresh()
  }

  const wrapClass = layout === 'inline' ? 'flex flex-wrap items-end gap-3' : 'space-y-3'
  const fieldClass = layout === 'inline' ? 'min-w-[140px]' : ''

  return (
    <div className={wrapClass}>
      <div className={fieldClass}>
        <label className="block text-xs uppercase tracking-wider text-text-dimmer font-semibold mb-1">Status</label>
        <div className="relative">
          <select
            value={localStatus}
            onChange={(e) => {
              const v = e.target.value as SupportStatus
              setLocalStatus(v)
              patch('status', v)
            }}
            disabled={pending === 'status'}
            className="w-full h-9 rounded-md border border-border bg-white dark:bg-input/30 px-2.5 text-sm shadow-xs"
          >
            {SUPPORT_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
          {pending === 'status' && <Loader2 className="absolute right-2 top-2.5 size-4 animate-spin text-text-dim" />}
        </div>
      </div>

      <div className={fieldClass}>
        <label className="block text-xs uppercase tracking-wider text-text-dimmer font-semibold mb-1">Priority</label>
        <div className="relative">
          <select
            value={localPriority}
            onChange={(e) => {
              const v = e.target.value as SupportPriority
              setLocalPriority(v)
              patch('priority', v)
            }}
            disabled={pending === 'priority'}
            className="w-full h-9 rounded-md border border-border bg-white dark:bg-input/30 px-2.5 text-sm shadow-xs"
          >
            {SUPPORT_PRIORITIES.map((p) => (
              <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
            ))}
          </select>
          {pending === 'priority' && <Loader2 className="absolute right-2 top-2.5 size-4 animate-spin text-text-dim" />}
        </div>
      </div>

      <div className={fieldClass}>
        <label className="block text-xs uppercase tracking-wider text-text-dimmer font-semibold mb-1">Assigned</label>
        <div className="relative">
          <select
            value={localAssignee}
            onChange={(e) => {
              const v = e.target.value
              setLocalAssignee(v)
              patch('assigned_to', v)
            }}
            disabled={pending === 'assigned_to'}
            className="w-full h-9 rounded-md border border-border bg-white dark:bg-input/30 px-2.5 text-sm shadow-xs"
          >
            <option value="">Unassigned</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          {pending === 'assigned_to' && <Loader2 className="absolute right-2 top-2.5 size-4 animate-spin text-text-dim" />}
        </div>
      </div>
    </div>
  )
}
