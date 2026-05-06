'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LifeBuoy, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TicketForm } from '@/components/support/ticket-form'

interface SupportTicketModalProps {
  /** Pre-fill the client picker. Pass the current client id when opening from a client detail page. */
  clientId?: string
  /** Trigger label override. Defaults to "Get Support". */
  triggerLabel?: string
  /** Trigger button variant. */
  triggerVariant?: 'default' | 'outline' | 'ghost' | 'secondary'
  /** Trigger size. */
  triggerSize?: 'sm' | 'default' | 'lg' | 'icon'
}

export function SupportTicketModal({
  clientId,
  triggerLabel = 'Get Support',
  triggerVariant = 'outline',
  triggerSize = 'sm',
}: SupportTicketModalProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [submittedId, setSubmittedId] = useState<string | null>(null)

  function handleSuccess(ticketId: string) {
    setSubmittedId(ticketId)
  }

  function handleClose() {
    setOpen(false)
    // Allow the dialog close animation to finish before resetting state
    setTimeout(() => setSubmittedId(null), 200)
  }

  return (
    <>
      <Button variant={triggerVariant} size={triggerSize} onClick={() => setOpen(true)}>
        <LifeBuoy className="size-4" />
        {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : handleClose())}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {submittedId ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="size-5 text-emerald-400" />
                  Ticket submitted
                </DialogTitle>
                <DialogDescription>
                  Our team has been notified and will get back to you soon. You can track this ticket from the Support page.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost" onClick={handleClose}>
                  Close
                </Button>
                <Button
                  onClick={() => {
                    handleClose()
                    router.push(`/support/${submittedId}`)
                  }}
                >
                  View ticket
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Submit a support ticket</DialogTitle>
                <DialogDescription>
                  Tell us what&apos;s going on — the more detail, the faster we can help.
                </DialogDescription>
              </DialogHeader>
              <TicketForm
                initialClientId={clientId}
                onSuccess={handleSuccess}
                onCancel={handleClose}
                compact
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
