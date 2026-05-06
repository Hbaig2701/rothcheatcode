import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  SupportTicket,
  SupportTicketAttachment,
  SupportTicketComment,
  SupportTicketEvent,
} from '@/lib/types/support'

export interface ProfileLite {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  role: string | null
}

export async function fetchTicketWithRelations(supabase: SupabaseClient, ticketId: string) {
  const [ticketRes, commentsRes, attachmentsRes, eventsRes] = await Promise.all([
    supabase.from('support_tickets').select('*').eq('id', ticketId).maybeSingle(),
    supabase
      .from('support_ticket_comments')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true }),
    supabase
      .from('support_ticket_attachments')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true }),
    supabase
      .from('support_ticket_events')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true }),
  ])

  return {
    ticket: ticketRes.data as SupportTicket | null,
    comments: (commentsRes.data ?? []) as SupportTicketComment[],
    attachments: (attachmentsRes.data ?? []) as SupportTicketAttachment[],
    events: (eventsRes.data ?? []) as SupportTicketEvent[],
  }
}

/**
 * Fetch profile + user_settings for a list of user_ids in two round-trips.
 * Returns a map keyed by user id.
 */
export async function fetchProfilesByIds(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Map<string, ProfileLite>> {
  const unique = Array.from(new Set(ids.filter(Boolean)))
  if (unique.length === 0) return new Map()
  const [profileRes, settingsRes] = await Promise.all([
    supabase.from('profiles').select('id, email, role').in('id', unique),
    supabase.from('user_settings').select('user_id, first_name, last_name').in('user_id', unique),
  ])
  const settingsByUser = new Map<string, { first_name: string | null; last_name: string | null }>()
  for (const s of (settingsRes.data ?? []) as Array<{ user_id: string; first_name: string | null; last_name: string | null }>) {
    settingsByUser.set(s.user_id, { first_name: s.first_name, last_name: s.last_name })
  }
  const map = new Map<string, ProfileLite>()
  for (const p of (profileRes.data ?? []) as Array<{ id: string; email: string | null; role: string | null }>) {
    const s = settingsByUser.get(p.id)
    map.set(p.id, {
      id: p.id,
      email: p.email,
      role: p.role,
      first_name: s?.first_name ?? null,
      last_name: s?.last_name ?? null,
    })
  }
  return map
}

export function profileDisplayName(p: ProfileLite | undefined | null): string {
  if (!p) return 'Unknown'
  const full = [p.first_name, p.last_name].filter(Boolean).join(' ').trim()
  return full || p.email || 'Unknown'
}

export function profileInitial(p: ProfileLite | undefined | null): string {
  const name = profileDisplayName(p)
  return name.charAt(0).toUpperCase()
}
