import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isAdmin } from '@/lib/auth/requireAdmin'
import {
  SUPPORT_STATUSES,
  SUPPORT_PRIORITIES,
  type SupportStatus,
  type SupportPriority,
} from '@/lib/types/support'

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

  return NextResponse.json(updated)
}
