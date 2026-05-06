import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_ATTACHMENTS_PER_TICKET,
} from '@/lib/types/support'

const allowedMime = new Set<string>(ALLOWED_ATTACHMENT_MIME_TYPES)

const createAttachmentSchema = z.object({
  file_path: z.string().min(1).max(500),
  file_name: z.string().min(1).max(255),
  mime_type: z.string().refine((v) => allowedMime.has(v), {
    message: 'Unsupported file type',
  }),
  file_size: z.number().int().positive().max(MAX_ATTACHMENT_SIZE_BYTES),
})

// Records a successful upload — file should already exist in storage at file_path.
// Storage RLS enforces that the user can only write to their own ticket folder, so this
// is a metadata mirror.
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

  const parsed = createAttachmentSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  // Cap attachments per ticket
  const { count } = await supabase
    .from('support_ticket_attachments')
    .select('id', { count: 'exact', head: true })
    .eq('ticket_id', id)

  if ((count ?? 0) >= MAX_ATTACHMENTS_PER_TICKET) {
    return NextResponse.json(
      { error: `Max ${MAX_ATTACHMENTS_PER_TICKET} attachments per ticket` },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('support_ticket_attachments')
    .insert({
      ticket_id: id,
      user_id: user.id,
      ...parsed.data,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}

// Generates a short-lived signed URL for downloading an attachment
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const path = url.searchParams.get('path')
  if (!path) {
    return NextResponse.json({ error: 'path is required' }, { status: 400 })
  }

  // Verify the attachment record exists for this ticket and the user can see it (RLS handles it)
  const { data: attachment, error: lookupError } = await supabase
    .from('support_ticket_attachments')
    .select('id, file_path')
    .eq('ticket_id', id)
    .eq('file_path', path)
    .maybeSingle()
  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 })
  }
  if (!attachment) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from('support-attachments')
    .createSignedUrl(path, 60 * 5)
  if (signedError) {
    return NextResponse.json({ error: signedError.message }, { status: 500 })
  }

  return NextResponse.json({ url: signed.signedUrl })
}
