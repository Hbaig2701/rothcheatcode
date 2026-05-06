import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import {
  SUPPORT_SEVERITIES,
  SUPPORT_CATEGORIES,
} from '@/lib/types/support'
import { notifySlackNewTicket } from '@/lib/notifications/slack'

const createTicketSchema = z.object({
  subject: z.string().trim().min(3, 'Subject too short').max(200),
  description: z.string().trim().min(5, 'Please describe the issue').max(10000),
  severity: z.enum(SUPPORT_SEVERITIES),
  category: z.enum(SUPPORT_CATEGORIES),
  client_id: z.string().uuid().nullable().optional(),
  report_id: z.string().uuid().nullable().optional(),
})

export async function POST(request: NextRequest) {
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

  const parsed = createTicketSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('support_tickets')
    .insert({
      ...parsed.data,
      client_id: parsed.data.client_id || null,
      report_id: parsed.data.report_id || null,
      user_id: user.id,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating ticket:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Slack notification — best-effort. Failures are logged inside notifySlackNewTicket
  // and never block the response. Resolve advisor display name + (optional) client
  // name in parallel so this adds at most one short round-trip.
  const [advisorSettingsRes, clientRes] = await Promise.all([
    supabase.from('user_settings').select('first_name, last_name').eq('user_id', user.id).maybeSingle(),
    data.client_id
      ? supabase.from('clients').select('name').eq('id', data.client_id).maybeSingle()
      : Promise.resolve({ data: null as { name: string } | null }),
  ])
  const advisorName = [advisorSettingsRes.data?.first_name, advisorSettingsRes.data?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim() || user.email || 'Advisor'

  await notifySlackNewTicket({
    ticketId: data.id,
    subject: data.subject,
    description: data.description,
    severity: data.severity,
    category: data.category,
    advisorName,
    advisorEmail: user.email ?? null,
    clientName: (clientRes.data?.name as string | undefined) ?? null,
  })

  return NextResponse.json(data, { status: 201 })
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
