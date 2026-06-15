'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Lets the advisor (ticket owner) close out their own ticket once support's
 * reply has resolved their issue. PATCHes status -> 'resolved' (re-openable
 * via ReopenButton if they still need help). 'closed' is reserved for admin
 * archival, so we intentionally use 'resolved' here.
 */
export function ResolveTicketButton({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function resolve() {
    setLoading(true)
    const res = await fetch(`/api/support-tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'resolved' }),
    })
    setLoading(false)
    if (res.ok) router.refresh()
  }

  return (
    <Button onClick={resolve} disabled={loading} size="sm">
      {loading ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
      Yes, close ticket
    </Button>
  )
}
