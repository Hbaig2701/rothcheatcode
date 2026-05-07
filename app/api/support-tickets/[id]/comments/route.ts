import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isAdmin } from '@/lib/auth/requireAdmin'
import { notifySlackNewComment } from '@/lib/notifications/slack'
import { createNotification } from '@/lib/notifications/create'

const createCommentSchema = z.object({
  body: z.string().trim().min(1, 'Comment cannot be empty').max(5000),
  is_internal: z.boolean().optional().default(false),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let json
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = createCommentSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  // Non-admins cannot create internal comments
  const userIsAdmin = await isAdmin(supabase, user.id)
  const isInternal = parsed.data.is_internal && userIsAdmin

  const { data, error } = await supabase
    .from('support_ticket_comments')
    .insert({
      ticket_id: id,
      user_id: user.id,
      body: parsed.data.body,
      is_internal: isInternal,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Bump ticket updated_at by touching status to itself? Cheaper: update updated_at via trigger.
  // The updated_at trigger only fires on UPDATE of support_tickets, so do a no-op update.
  await supabase
    .from('support_tickets')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', id)

  // Audit event
  await supabase.from('support_ticket_events').insert({
    ticket_id: id,
    user_id: user.id,
    event_type: isInternal ? 'internal_comment_added' : 'comment_added',
    old_value: null,
    new_value: null,
  })

  // In-app notification: when an admin posts a public reply, the advisor
  // who owns the ticket gets a bell notification linking to their ticket.
  // Skip internal notes (advisor can't see them) and advisor-authored
  // comments (they wrote it themselves).
  if (userIsAdmin && !isInternal) {
    const { data: ticketRow } = await supabase
      .from('support_tickets')
      .select('user_id, subject')
      .eq('id', id)
      .maybeSingle()
    if (ticketRow && ticketRow.user_id !== user.id) {
      await createNotification({
        user_id: ticketRow.user_id as string,
        type: 'support_ticket_reply',
        title: 'Support Team replied',
        body: `Re: ${ticketRow.subject}`,
        link_url: `/support/${id}`,
        related_id: id,
      })
    }
  }

  // Slack notification on advisor (non-admin) replies. Skip internal notes
  // and admin-authored public replies (those originate from the team).
  if (!userIsAdmin && !isInternal) {
    const [ticketRes, settingsRes] = await Promise.all([
      supabase.from('support_tickets').select('subject, status').eq('id', id).maybeSingle(),
      supabase.from('user_settings').select('first_name, last_name').eq('user_id', user.id).maybeSingle(),
    ])
    const authorName = [settingsRes.data?.first_name, settingsRes.data?.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() || user.email || 'Advisor'
    if (ticketRes.data) {
      await notifySlackNewComment({
        ticketId: id,
        ticketSubject: ticketRes.data.subject,
        ticketStatus: ticketRes.data.status,
        authorName,
        authorIsAdmin: false,
        body: parsed.data.body,
      })
    }
  }

  return NextResponse.json(data, { status: 201 })
}
