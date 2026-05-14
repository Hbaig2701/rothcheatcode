import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isAdmin } from '@/lib/auth/requireAdmin'
import { notifySlackNewComment } from '@/lib/notifications/slack'
import { createNotification } from '@/lib/notifications/create'
import { sendTicketReplyEmail } from '@/lib/notifications/email'

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

  // In-app notification + email: when an admin posts a public reply, the
  // advisor who owns the ticket gets both a bell notification AND a
  // transactional email. Pre-email-integration, advisors only got the
  // bell — half of those went unread because advisors don't keep the app
  // open between sessions. Skip internal notes (advisor can't see them)
  // and admin-self-replies (they wrote it themselves, no need to ping).
  if (userIsAdmin && !isInternal) {
    const { data: ticketRow } = await supabase
      .from('support_tickets')
      .select('user_id, subject')
      .eq('id', id)
      .maybeSingle()
    if (ticketRow && ticketRow.user_id !== user.id) {
      const ownerId = ticketRow.user_id as string
      await createNotification({
        user_id: ownerId,
        type: 'support_ticket_reply',
        title: 'Support Team replied',
        body: `Re: ${ticketRow.subject}`,
        link_url: `/support/${id}`,
        related_id: id,
      })

      // Fetch the advisor's email + name for the transactional email. Use
      // the admin client so RLS doesn't block reading another user's
      // profile row. Best-effort — failures must never block the
      // underlying ticket reply from succeeding.
      try {
        const admin = createAdminClient()
        const [profileRes, settingsRes] = await Promise.all([
          admin.from('profiles').select('email').eq('id', ownerId).maybeSingle(),
          admin.from('user_settings').select('first_name').eq('user_id', ownerId).maybeSingle(),
        ])
        const recipientEmail = profileRes.data?.email as string | undefined
        if (recipientEmail) {
          await sendTicketReplyEmail({
            to: recipientEmail,
            firstName: (settingsRes.data?.first_name as string | undefined) ?? null,
            ticketId: id,
            ticketSubject: ticketRow.subject as string,
            replyBody: parsed.data.body,
          })
        } else {
          console.warn('[support-comments] No email on file for advisor — skipped reply email', { ownerId, ticketId: id })
        }
      } catch (err) {
        console.error('[support-comments] Email send error (non-fatal)', err)
      }
    }
  }

  // Slack notification + in-app bell for admins on advisor (non-admin) replies.
  // Skip internal notes (admins-only anyway) and admin-authored public replies
  // (those originate from the team).
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

      // In-app bell for every admin so the support centre surfaces new replies
      // without requiring a Slack check. MUST use the admin client for the
      // profile lookup — the previous version used the request's RLS-scoped
      // client, which (when the request comes from an advisor) returns no
      // other-user profiles, so the admin list came back empty and zero
      // notifications were created. createNotification itself already uses
      // the admin client to insert; the lookup is what was broken.
      // Link URL points at the admin-facing /support-centre/[id] route -
      // confusingly named, but that's the admin view (with status controls
      // and assignee dropdown). /support/[id] is the advisor view.
      const adminClient = createAdminClient()
      const { data: adminProfiles } = await adminClient
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
      await Promise.all(
        ((adminProfiles ?? []) as Array<{ id: string }>).map((admin) =>
          createNotification({
            user_id: admin.id,
            type: 'support_ticket_reply',
            title: `${authorName} replied`,
            body: `Re: ${ticketRes.data!.subject}`,
            link_url: `/support-centre/${id}`,
            related_id: id,
          })
        )
      )
    }
  }

  return NextResponse.json(data, { status: 201 })
}
