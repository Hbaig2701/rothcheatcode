import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Bell, Sparkles } from 'lucide-react'
import { UpdatesList } from './updates-list'

export default async function UpdatesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="p-10 max-w-4xl">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-accent border border-gold-border">
            <Bell className="h-6 w-6 text-gold" />
          </div>
          <div>
            <h1 className="text-[28px] font-display font-bold text-foreground leading-tight">Platform Updates</h1>
            <p className="text-base text-text-dim mt-0.5">
              Stay in the loop with our latest features, improvements, and fixes
            </p>
          </div>
        </div>
      </div>

      {/* Updates List */}
      <UpdatesList />

      {/* Footer message */}
      <div className="mt-8 rounded-[14px] bg-bg-card border border-border-default px-6 py-5 flex items-center justify-center gap-2 text-center">
        <Sparkles className="w-4 h-4 text-gold" />
        <p className="text-sm text-text-dimmer">
          We&apos;re constantly improving the platform based on your feedback.
        </p>
      </div>
    </div>
  )
}
