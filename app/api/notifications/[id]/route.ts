import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// PATCH /api/notifications/[id] — mark one notification as read (or unread).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { is_read?: boolean } = {}
  try {
    body = await request.json()
  } catch {
    body = { is_read: true }
  }
  const isRead = body.is_read !== false // default to true (mark read)

  const { error } = await supabase
    .from('notifications')
    .update({
      is_read: isRead,
      read_at: isRead ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
