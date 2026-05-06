'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ReopenButton({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function reopen() {
    setLoading(true)
    const res = await fetch(`/api/support-tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'open' }),
    })
    setLoading(false)
    if (res.ok) router.refresh()
  }

  return (
    <Button variant="outline" onClick={reopen} disabled={loading} size="sm">
      {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
      Re-open ticket
    </Button>
  )
}
