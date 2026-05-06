import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ChevronLeft, LifeBuoy } from 'lucide-react'
import { TicketForm } from '@/components/support/ticket-form'

interface PageProps {
  searchParams: Promise<{ client?: string }>
}

export default async function NewSupportTicketPage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const clientId = params.client

  return (
    <div className="p-10 max-w-3xl">
      <Link
        href="/support"
        className="inline-flex items-center gap-1 text-sm text-text-dim hover:text-foreground mb-6 transition-colors"
      >
        <ChevronLeft className="size-4" />
        Back to Support
      </Link>

      <div className="flex items-center gap-4 mb-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-accent border border-gold-border">
          <LifeBuoy className="h-6 w-6 text-gold" />
        </div>
        <div>
          <h1 className="text-[28px] font-display font-bold text-foreground leading-tight">New ticket</h1>
          <p className="text-base text-text-dim mt-0.5">Tell us what&apos;s going on — the more detail, the faster we can help</p>
        </div>
      </div>

      <div className="rounded-[14px] bg-bg-card border border-border-default p-6">
        <TicketForm initialClientId={clientId} />
      </div>
    </div>
  )
}
