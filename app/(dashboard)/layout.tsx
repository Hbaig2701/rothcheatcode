import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  // Check if account is deactivated
  const { data: profile } = await supabase.from('profiles').select('is_active').eq('id', user.id).single()
  if (profile?.is_active === false) {
    await supabase.auth.signOut()
    redirect('/login?error=Your account has been deactivated.')
  }

  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get('sidebar_state')?.value !== 'false'

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar user={user} />
      <main className="flex-1 flex flex-col min-h-screen bg-[#0c0c0c]">
        <div className="flex-1">
          {children}
        </div>
      </main>
    </SidebarProvider>
  )
}
