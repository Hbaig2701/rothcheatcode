import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isAdmin } from '@/lib/auth/requireAdmin'
import {
  SUPPORT_STATUSES,
  SUPPORT_PRIORITIES,
  STATUS_LABELS,
  type SupportStatus,
  type SupportPriority,
} from '@/lib/types/support'
import { createNotification } from '@/lib/notifications/create'
import { sendTicketStatusChangeEmail } from '@/lib/notifications/email'

const adminUpdateSchema = z.object({
  status: z.enum(SUPPORT_STATUSES).optional(),
  priority: z.enum(SUPPORT_PRIORITIES).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
})

const userUpdateSchema = z.object({
  // advisors can only re-open closed/resolved tickets
  status: z.enum(['open']).optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const userIsAdmin = await isAdmin(supabase, user.id)
  const schema = userIsAdmin ? adminUpdateSchema : userUpdateSchema
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  // Fetch existing ticket so we can detect changes for the audit log
  const { data: existing, error: fetchError } = await supabase
    .from('support_tickets')
    .select('id, user_id, status, priority, assigned_to')
    .eq('id', id)
    .single()
  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  }

  // Non-admins must own the ticket and can only set status -> open
  if (!userIsAdmin && existing.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const updates = parsed.data as { status?: SupportStatus; priority?: SupportPriority; assigned_to?: string | null }
  const update: Record<string, unknown> = { ...updates }
  if (updates.status === 'resolved' || updates.status === 'closed') {
    update.resolved_at = new Date().toISOString()
  } else if (updates.status === 'open' || updates.status === 'in_progress' || updates.status === 'waiting_on_user') {
    update.resolved_at = null
  }

  const { data: updated, error: updateError } = await supabase
    .from('support_tickets')
    .update(update)
    .eq('id', id)
    .select()
    .single()
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Write events for changes
  const events: Array<{ ticket_id: string; user_id: string; event_type: string; old_value: string | null; new_value: string | null }> = []
  if (updates.status && updates.status !== existing.status) {
    events.push({ ticket_id: id, user_id: user.id, event_type: 'status_change', old_value: existing.status, new_value: updates.status })
  }
  if (updates.priority && updates.priority !== existing.priority) {
    events.push({ ticket_id: id, user_id: user.id, event_type: 'priority_change', old_value: existing.priority, new_value: updates.priority })
  }
  if (updates.assigned_to !== undefined && updates.assigned_to !== existing.assigned_to) {
    events.push({ ticket_id: id, user_id: user.id, event_type: 'assigned', old_value: existing.assigned_to, new_value: updates.assigned_to })
  }
  if (events.length > 0) {
    await supabase.from('support_ticket_events').insert(events)
  }

  // In-app notification + email when an admin changes the status of an
  // advisor's ticket. Skip when the advisor is re-opening their own ticket
  // — they triggered the change themselves, no need to notify them.
  // The email is critical for waiting_on_user (advisor must respond) and
  // resolved/closed (so they know the ticket is done); the in-app bell
  // alone has a ~55% unread rate because advisors don't keep the app open.
  if (userIsAdmin && updates.status && updates.status !== existing.status && existing.user_id !== user.id) {
    const { data: ticketRow } = await supabase
      .from('support_tickets')
      .select('subject')
      .eq('id', id)
      .maybeSingle()
    await createNotification({
      user_id: existing.user_id as string,
      type: 'support_ticket_status_change',
      title: `Status changed to ${STATUS_LABELS[updates.status]}`,
      body: ticketRow?.subject ? `Re: ${ticketRow.subject}` : null,
      link_url: `/support/${id}`,
      related_id: id,
    })

    // Email — best-effort, never block the PATCH on email-send failures.
    try {
      const admin = createAdminClient()
      const [profileRes, settingsRes] = await Promise.all([
        admin.from('profiles').select('email').eq('id', existing.user_id as string).maybeSingle(),
        admin.from('user_settings').select('first_name').eq('user_id', existing.user_id as string).maybeSingle(),
      ])
      const recipientEmail = profileRes.data?.email as string | undefined
      if (recipientEmail && ticketRow?.subject) {
        await sendTicketStatusChangeEmail({
          to: recipientEmail,
          firstName: (settingsRes.data?.first_name as string | undefined) ?? null,
          ticketId: id,
          ticketSubject: ticketRow.subject as string,
          newStatus: updates.status,
          newStatusLabel: STATUS_LABELS[updates.status],
        })
      } else if (!recipientEmail) {
        console.warn('[support-tickets] No email on file for advisor — skipped status email', { advisor_id: existing.user_id, ticketId: id })
      }
    } catch (err) {
      console.error('[support-tickets] Status-change email error (non-fatal)', err)
    }
  }

  return NextResponse.json(updated)
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!(await isAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Pull attachment paths up-front — the FK cascade will drop the rows when
  // the ticket is deleted, but Storage objects are independent and would
  // otherwise be orphaned indefinitely.
  const { data: attachments } = await supabase
    .from('support_ticket_attachments')
    .select('file_path')
    .eq('ticket_id', id)
  const paths = ((attachments ?? []) as Array<{ file_path: string }>).map((a) => a.file_path)

  const { error: deleteError } = await supabase
    .from('support_tickets')
    .delete()
    .eq('id', id)
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from('support-attachments')
      .remove(paths)
    if (storageError) {
      // Non-fatal — the ticket is gone, but log so we can investigate
      // orphaned files later if this happens repeatedly.
      console.error('[support-tickets] Storage cleanup failed for ticket', id, storageError)
    }
  }

  return NextResponse.json({ success: true })
}
