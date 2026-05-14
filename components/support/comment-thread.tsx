'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Lock, Send, Pencil, Trash2, X, Check, Paperclip, FileText, Image as ImageIcon, ExternalLink } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MarkdownBody } from '@/components/support/markdown-body'
import { LocalTime } from '@/components/support/local-time'
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
  type SupportTicketComment,
  type SupportTicketAttachment,
} from '@/lib/types/support'

const allowedMimeSet = new Set<string>(ALLOWED_ATTACHMENT_MIME_TYPES)
const MAX_ATTACHMENTS_PER_COMMENT = 5

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
  /** Comment-linked attachments (NOT the top-level ticket attachments). */
  commentAttachments: SupportTicketAttachment[]
  /** When true, render the "internal note" toggle on the composer. */
  canPostInternal: boolean
  /** Current user id — used to gate edit/delete affordances on each row. */
  currentUserId: string
}

export function CommentThread({
  ticketId,
  comments,
  commentAttachments,
  canPostInternal,
  currentUserId,
}: CommentThreadProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [body, setBody] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [openingAttachmentId, setOpeningAttachmentId] = useState<string | null>(null)

  // Group attachments by comment_id for inline rendering.
  const attachmentsByComment = new Map<string, SupportTicketAttachment[]>()
  for (const a of commentAttachments) {
    if (!a.comment_id) continue
    const list = attachmentsByComment.get(a.comment_id) ?? []
    list.push(a)
    attachmentsByComment.set(a.comment_id, list)
  }

  function handlePickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? [])
    e.target.value = '' // allow re-picking the same file
    setError(null)
    const next = [...files]
    for (const f of selected) {
      if (next.length >= MAX_ATTACHMENTS_PER_COMMENT) {
        setError(`Max ${MAX_ATTACHMENTS_PER_COMMENT} files per reply`)
        break
      }
      if (!allowedMimeSet.has(f.type)) {
        setError(`Unsupported file type: ${f.name}`)
        continue
      }
      if (f.size > MAX_ATTACHMENT_SIZE_BYTES) {
        setError(`${f.name} exceeds 25MB`)
        continue
      }
      next.push(f)
    }
    setFiles(next)
  }

  function removeStagedFile(idx: number) {
    setFiles(files.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim() && files.length === 0) return
    setError(null)
    setSubmitting(true)

    try {
      // 1. Post the comment first to get its ID.
      // Body is required by the API schema (min length 1). When the user
      // only attaches files without typing anything, fall back to a short
      // descriptive placeholder so the conversation row reads naturally
      // ("Sent attachments" sits above the file chips).
      const res = await fetch(`/api/support-tickets/${ticketId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: body.trim() || (files.length > 0 ? 'Sent attachments' : ''),
          is_internal: isInternal,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Failed to post comment')
      }
      const comment: { id: string } = await res.json()

      // 2. Upload files to storage and record metadata against this comment.
      // Storage RLS allows anyone authorized for the ticket to write under
      // {ticketId}/... — same path the original ticket form uses.
      if (files.length > 0) {
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        )
        for (const f of files) {
          const ext = f.name.split('.').pop() ?? 'bin'
          const objectKey = `${ticketId}/${crypto.randomUUID()}.${ext}`
          const { error: uploadErr } = await supabase.storage
            .from('support-attachments')
            .upload(objectKey, f, { contentType: f.type, upsert: false })
          if (uploadErr) {
            throw new Error(`Upload failed: ${uploadErr.message}`)
          }
          const recRes = await fetch(`/api/support-tickets/${ticketId}/attachments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              file_path: objectKey,
              file_name: f.name,
              mime_type: f.type,
              file_size: f.size,
              comment_id: comment.id,
            }),
          })
          if (!recRes.ok) {
            const j = await recRes.json().catch(() => ({}))
            throw new Error(j.error ?? 'Failed to record attachment')
          }
        }
      }

      setBody('')
      setIsInternal(false)
      setFiles([])
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
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

  async function openAttachment(att: SupportTicketAttachment) {
    setOpeningAttachmentId(att.id)
    const res = await fetch(`/api/support-tickets/${ticketId}/attachments?path=${encodeURIComponent(att.file_path)}`)
    setOpeningAttachmentId(null)
    if (!res.ok) return
    const json = await res.json()
    if (json.url) window.open(json.url, '_blank', 'noopener,noreferrer')
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
            const inlineAttachments = attachmentsByComment.get(c.id) ?? []
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
                  <>
                    {c.body && <MarkdownBody>{c.body}</MarkdownBody>}
                    {inlineAttachments.length > 0 && (
                      <ul className={cn(
                        'flex flex-wrap gap-2',
                        c.body ? 'mt-2.5' : ''
                      )}>
                        {inlineAttachments.map((att) => {
                          const isImage = att.mime_type.startsWith('image/')
                          return (
                            <li key={att.id}>
                              <button
                                type="button"
                                onClick={() => openAttachment(att)}
                                disabled={openingAttachmentId === att.id}
                                className="inline-flex items-center gap-2 rounded-md border border-border-default bg-bg-base hover:bg-accent/40 transition-colors px-2.5 py-1.5 text-xs"
                              >
                                {isImage ? (
                                  <ImageIcon className="size-3.5 text-text-dim" />
                                ) : (
                                  <FileText className="size-3.5 text-text-dim" />
                                )}
                                <span className="text-foreground max-w-[180px] truncate">{att.file_name}</span>
                                <span className="text-text-dimmer">{(att.file_size / 1024).toFixed(0)} KB</span>
                                {openingAttachmentId === att.id ? (
                                  <Loader2 className="size-3 animate-spin text-text-dim" />
                                ) : (
                                  <ExternalLink className="size-3 text-text-dim" />
                                )}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </>
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

        {files.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {files.map((f, idx) => (
              <li
                key={idx}
                className="inline-flex items-center gap-2 rounded-md border border-border-default bg-bg-card px-2.5 py-1.5 text-xs"
              >
                {f.type.startsWith('image/') ? (
                  <ImageIcon className="size-3.5 text-text-dim" />
                ) : (
                  <FileText className="size-3.5 text-text-dim" />
                )}
                <span className="text-foreground max-w-[180px] truncate">{f.name}</span>
                <span className="text-text-dimmer">{(f.size / 1024).toFixed(0)} KB</span>
                <button
                  type="button"
                  onClick={() => removeStagedFile(idx)}
                  className="text-text-dim hover:text-destructive transition-colors"
                  aria-label={`Remove ${f.name}`}
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ALLOWED_ATTACHMENT_MIME_TYPES.join(',')}
              onChange={handlePickFiles}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting || files.length >= MAX_ATTACHMENTS_PER_COMMENT}
              className="inline-flex items-center gap-1.5 text-xs text-text-dim hover:text-foreground disabled:opacity-50 transition-colors"
            >
              <Paperclip className="size-3.5" />
              Attach files
            </button>
            {canPostInternal && (
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
            )}
          </div>
          <Button type="submit" disabled={submitting || (!body.trim() && files.length === 0)}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Send
          </Button>
        </div>
      </form>
    </div>
  )
}
