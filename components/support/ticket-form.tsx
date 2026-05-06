'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Paperclip, X, AlertCircle, FileText } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import {
  SUPPORT_SEVERITIES,
  SUPPORT_CATEGORIES,
  SEVERITY_LABELS,
  CATEGORY_LABELS,
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_ATTACHMENTS_PER_TICKET,
  type SupportSeverity,
  type SupportCategory,
} from '@/lib/types/support'

interface ClientOption {
  id: string
  name: string
}

interface TicketFormProps {
  initialClientId?: string
  /** Called after a successful submission. Receives the new ticket id. */
  onSuccess?: (ticketId: string) => void
  /** Called when the user clicks Cancel — only relevant in modal mode. */
  onCancel?: () => void
  /** When true, hide page-level chrome (used inside modal). */
  compact?: boolean
}

const allowedMimeSet = new Set<string>(ALLOWED_ATTACHMENT_MIME_TYPES)

export function TicketForm({ initialClientId, onSuccess, onCancel, compact = false }: TicketFormProps) {
  const router = useRouter()
  const supabase = createClient()

  const [clients, setClients] = useState<ClientOption[]>([])

  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<SupportSeverity>('medium')
  const [category, setCategory] = useState<SupportCategory>('question')
  const [clientId, setClientId] = useState<string>(initialClientId ?? '')
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch the user's clients for the dropdown
  useEffect(() => {
    let cancelled = false
    async function load() {
      const clientsRes = await fetch('/api/clients').then((r) => (r.ok ? r.json() : []))
      if (cancelled) return
      const clientList: ClientOption[] = Array.isArray(clientsRes)
        ? clientsRes.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))
        : []
      setClients(clientList)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? [])
    e.target.value = '' // allow re-selecting the same file later
    const next = [...files]
    for (const f of selected) {
      if (next.length >= MAX_ATTACHMENTS_PER_TICKET) {
        setError(`Max ${MAX_ATTACHMENTS_PER_TICKET} attachments`)
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

  function removeFile(idx: number) {
    setFiles(files.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res = await fetch('/api/support-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          description: description.trim(),
          severity,
          category,
          client_id: clientId || null,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Failed to create ticket')
      }
      const ticket: { id: string } = await res.json()

      // Upload attachments (if any) to storage, then record metadata
      for (const f of files) {
        const ext = f.name.split('.').pop() ?? 'bin'
        const objectKey = `${ticket.id}/${crypto.randomUUID()}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('support-attachments')
          .upload(objectKey, f, { contentType: f.type, upsert: false })
        if (uploadErr) {
          throw new Error(`Upload failed: ${uploadErr.message}`)
        }
        const recRes = await fetch(`/api/support-tickets/${ticket.id}/attachments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_path: objectKey,
            file_name: f.name,
            mime_type: f.type,
            file_size: f.size,
          }),
        })
        if (!recRes.ok) {
          const j = await recRes.json().catch(() => ({}))
          throw new Error(j.error ?? 'Failed to record attachment')
        }
      }

      if (onSuccess) {
        onSuccess(ticket.id)
      } else {
        router.push(`/support/${ticket.id}`)
        router.refresh()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={compact ? 'space-y-4' : 'space-y-6'}>
      {error && (
        <div className="flex items-start gap-2 rounded-[10px] border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
          <AlertCircle className="size-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/85">Subject</label>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          minLength={3}
          maxLength={200}
          placeholder="Short summary of the issue"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground/85">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as SupportCategory)}
            className="w-full h-9 rounded-md border border-border bg-white dark:bg-input/30 px-2.5 text-sm shadow-xs"
          >
            {SUPPORT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground/85">Severity</label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as SupportSeverity)}
            className="w-full h-9 rounded-md border border-border bg-white dark:bg-input/30 px-2.5 text-sm shadow-xs"
          >
            {SUPPORT_SEVERITIES.map((s) => (
              <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/85">Related Client (optional)</label>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="w-full h-9 rounded-md border border-border bg-white dark:bg-input/30 px-2.5 text-sm shadow-xs"
        >
          <option value="">— None —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/85">Description</label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          minLength={5}
          maxLength={10000}
          rows={6}
          placeholder="Describe the issue, including what you expected vs what happened. Steps to reproduce help us a lot."
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground/85">Attachments</label>
        <p className="text-xs text-text-dim">
          Drop the report PDF and any screenshots here. Up to {MAX_ATTACHMENTS_PER_TICKET} files (PNG, JPEG, WEBP, PDF — 25MB each).
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 cursor-pointer rounded-md border border-border bg-white dark:bg-input/30 px-3 py-1.5 text-sm hover:bg-accent transition-colors">
            <Paperclip className="size-4" />
            <span>Add file</span>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
          </label>
          {files.length > 0 && (
            <span className="text-xs text-text-dim">{files.length} selected</span>
          )}
        </div>
        {files.length > 0 && (
          <ul className="space-y-1.5 mt-2">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center justify-between rounded-md border border-border-default bg-bg-card px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="size-4 text-text-dim shrink-0" />
                  <span className="truncate">{f.name}</span>
                  <span className="text-xs text-text-dimmer shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="text-text-dim hover:text-destructive transition-colors p-1"
                  aria-label="Remove"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="size-4 animate-spin" />}
          Submit ticket
        </Button>
      </div>
    </form>
  )
}
