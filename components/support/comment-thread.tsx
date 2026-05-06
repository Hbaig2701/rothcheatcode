'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Lock, Send } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SupportTicketComment } from '@/lib/types/support'

interface CommentAuthor {
  id: string
  name: string
  initial: string
  isAdmin: boolean
}

interface CommentItem extends SupportTicketComment {
  author?: CommentAuthor | null
}

interface CommentThreadProps {
  ticketId: string
  comments: CommentItem[]
  /** When true, render the "internal note" toggle on the composer. */
  canPostInternal: boolean
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function CommentThread({ ticketId, comments, canPostInternal }: CommentThreadProps) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setError(null)
    setSubmitting(true)

    const res = await fetch(`/api/support-tickets/${ticketId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: body.trim(), is_internal: isInternal }),
    })

    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? 'Failed to post comment')
      setSubmitting(false)
      return
    }

    setBody('')
    setIsInternal(false)
    setSubmitting(false)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {comments.length === 0 ? (
        <p className="text-sm text-text-dim italic">No replies yet.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li
              key={c.id}
              className={cn(
                'rounded-[12px] border px-4 py-3',
                c.is_internal
                  ? 'border-yellow-500/30 bg-yellow-500/5'
                  : c.author?.isAdmin
                  ? 'border-gold-border/50 bg-accent/40'
                  : 'border-border-default bg-bg-card'
              )}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className={cn(
                  'flex size-6 items-center justify-center rounded-full text-[11px] font-semibold',
                  c.author?.isAdmin ? 'bg-gold/20 text-gold' : 'bg-muted text-foreground'
                )}>
                  {c.author?.isAdmin ? 'S' : (c.author?.initial ?? '?')}
                </div>
                <span className="text-sm font-medium text-foreground">
                  {c.author?.isAdmin ? 'Support Team' : (c.author?.name ?? 'Unknown')}
                </span>
                <span className="text-xs text-text-dimmer">·</span>
                <span className="text-xs text-text-dimmer">{formatTime(c.created_at)}</span>
                {c.is_internal && (
                  <span className="ml-auto inline-flex items-center gap-1 text-xs text-yellow-400 font-medium">
                    <Lock className="size-3" />
                    Internal
                  </span>
                )}
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="space-y-2">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={canPostInternal ? 'Write a reply…' : 'Add a follow-up or extra info…'}
          rows={3}
          maxLength={5000}
        />
        <div className="flex items-center justify-between">
          {canPostInternal ? (
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={isInternal}
                onChange={(e) => setIsInternal(e.target.checked)}
                className="size-4 rounded border-border"
              />
              <span className="inline-flex items-center gap-1">
                <Lock className="size-3.5 text-yellow-400" />
                Internal note (advisor cannot see)
              </span>
            </label>
          ) : (
            <span />
          )}
          <Button type="submit" disabled={submitting || !body.trim()}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Send
          </Button>
        </div>
      </form>
    </div>
  )
}
