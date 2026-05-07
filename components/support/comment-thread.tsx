'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Lock, Send, Pencil, Trash2, X, Check } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { LinkifiedText } from '@/components/support/linkified-text'
import { LocalTime } from '@/components/support/local-time'
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
  /** Current user id — used to gate edit/delete affordances on each row. */
  currentUserId: string
}

export function CommentThread({ ticketId, comments, canPostInternal, currentUserId }: CommentThreadProps) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

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

  async function saveEdit(commentId: string) {
    if (!editBody.trim()) return
    setEditSaving(true)
    const res = await fetch(`/api/support-tickets/${ticketId}/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: editBody.trim() }),
    })
    setEditSaving(false)
    if (!res.ok) return
    setEditingId(null)
    setEditBody('')
    router.refresh()
  }

  async function deleteComment(commentId: string) {
    const res = await fetch(`/api/support-tickets/${ticketId}/comments/${commentId}`, {
      method: 'DELETE',
    })
    setPendingDeleteId(null)
    if (!res.ok) return
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {comments.length === 0 ? (
        <p className="text-sm text-text-dim italic">No replies yet.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => {
            const isOwn = c.user_id === currentUserId
            const isEditing = editingId === c.id
            const wasEdited = c.updated_at != null
            return (
              <li
                key={c.id}
                className={cn(
                  'group/comment relative rounded-[12px] border px-4 py-3',
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
                  <span className="text-xs text-text-dimmer">
                    <LocalTime iso={c.created_at} format="date-time" />
                  </span>
                  {wasEdited && (
                    <span className="text-xs text-text-dimmer italic">(edited)</span>
                  )}
                  {c.is_internal && (
                    <span className="inline-flex items-center gap-1 text-xs text-yellow-400 font-medium">
                      <Lock className="size-3" />
                      Internal
                    </span>
                  )}
                  {isOwn && !isEditing && (
                    <div className="ml-auto flex items-center gap-1 opacity-0 group-hover/comment:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => { setEditingId(c.id); setEditBody(c.body) }}
                        className="text-xs text-text-dim hover:text-foreground p-1 rounded hover:bg-accent transition-colors"
                        aria-label="Edit"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteId(c.id)}
                        className="text-xs text-text-dim hover:text-destructive p-1 rounded hover:bg-destructive/10 transition-colors"
                        aria-label="Delete"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={3}
                      maxLength={5000}
                    />
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => { setEditingId(null); setEditBody('') }}
                        disabled={editSaving}
                      >
                        <X className="size-3.5" />
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => saveEdit(c.id)}
                        disabled={editSaving || !editBody.trim()}
                      >
                        {editSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                        Save
                      </Button>
                    </div>
                  </div>
                ) : pendingDeleteId === c.id ? (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 flex items-center justify-between gap-3">
                    <span className="text-sm text-foreground">Delete this comment?</span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setPendingDeleteId(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => deleteComment(c.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                    <LinkifiedText>{c.body}</LinkifiedText>
                  </p>
                )}
              </li>
            )
          })}
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
