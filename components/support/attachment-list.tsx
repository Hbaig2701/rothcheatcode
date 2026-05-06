'use client'

import { useState } from 'react'
import { FileText, Image as ImageIcon, Loader2, ExternalLink } from 'lucide-react'
import type { SupportTicketAttachment } from '@/lib/types/support'

export function AttachmentList({ ticketId, attachments }: { ticketId: string; attachments: SupportTicketAttachment[] }) {
  const [loadingId, setLoadingId] = useState<string | null>(null)

  if (attachments.length === 0) {
    return <p className="text-sm text-text-dim italic">No attachments.</p>
  }

  async function open(att: SupportTicketAttachment) {
    setLoadingId(att.id)
    const res = await fetch(`/api/support-tickets/${ticketId}/attachments?path=${encodeURIComponent(att.file_path)}`)
    setLoadingId(null)
    if (!res.ok) return
    const json = await res.json()
    if (json.url) window.open(json.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <ul className="space-y-2">
      {attachments.map((att) => {
        const isImage = att.mime_type.startsWith('image/')
        return (
          <li
            key={att.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border-default bg-bg-card px-3 py-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              {isImage ? <ImageIcon className="size-4 text-text-dim shrink-0" /> : <FileText className="size-4 text-text-dim shrink-0" />}
              <span className="text-sm truncate">{att.file_name}</span>
              <span className="text-xs text-text-dimmer shrink-0">{(att.file_size / 1024).toFixed(0)} KB</span>
            </div>
            <button
              type="button"
              onClick={() => open(att)}
              disabled={loadingId === att.id}
              className="inline-flex items-center gap-1 text-xs text-text-dim hover:text-foreground transition-colors"
            >
              {loadingId === att.id ? <Loader2 className="size-3.5 animate-spin" /> : <ExternalLink className="size-3.5" />}
              Open
            </button>
          </li>
        )
      })}
    </ul>
  )
}
