import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import Link from 'next/link'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')
  await requireAdmin(supabase, user)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border-default bg-[rgba(255,255,255,0.02)]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="Retirement Expert" className="h-6 w-auto" />
              <span className="text-lg font-semibold tracking-tight">Admin</span>
            </div>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/admin" className="text-text-dim hover:text-foreground transition-colors">
                Dashboard
              </Link>
              <Link href="/admin/advisors" className="text-text-dim hover:text-foreground transition-colors">
                Advisors
              </Link>
            </nav>
          </div>
          <Link href="/dashboard" className="text-sm text-text-dim hover:text-foreground transition-colors">
            Back to App
          </Link>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  )
}
