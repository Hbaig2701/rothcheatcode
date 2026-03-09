import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

  // Fetch profile with subscription fields
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_active, plan, subscription_status, stripe_customer_id, team_owner_id')
    .eq('id', user.id)
    .single()

  // Check if account is deactivated
  if (profile?.is_active === false) {
    await supabase.auth.signOut()
    redirect('/login?error=Your account has been deactivated.')
  }

  // Subscription access control
  if (profile?.team_owner_id) {
    // Team member — check owner's subscription (use admin client to bypass RLS)
    const adminClient = createAdminClient()
    const { data: owner } = await adminClient
      .from('profiles')
      .select('plan, subscription_status, stripe_customer_id')
      .eq('id', profile.team_owner_id)
      .single()

    const ownerGrandfathered = owner?.plan === 'pro' && !owner?.stripe_customer_id
    const ownerActive = ['starter', 'pro'].includes(owner?.plan ?? '') && owner?.subscription_status === 'active'

    if (!ownerGrandfathered && !ownerActive) {
      redirect('/subscription-inactive')
    }
  } else {
    // Owner or independent user
    const isGrandfathered = profile?.plan === 'pro' && !profile?.stripe_customer_id
    const hasActiveSubscription =
      ['starter', 'pro'].includes(profile?.plan ?? '') && profile?.subscription_status === 'active'

    if (!isGrandfathered && !hasActiveSubscription) {
      redirect('/subscription-inactive')
    }
  }

  // Fetch user's display name from user_settings
  const { data: userSettings } = await supabase
    .from('user_settings')
    .select('first_name, last_name')
    .eq('user_id', user.id)
    .single()

  const displayName = [userSettings?.first_name, userSettings?.last_name].filter(Boolean).join(' ')
    || user.user_metadata?.full_name
    || user.email?.split('@')[0]
    || 'User'

  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get('sidebar_state')?.value !== 'false'

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar user={user} displayName={displayName} />
      <main className="flex-1 flex flex-col min-h-screen bg-[#0c0c0c]">
        <div className="flex-1">
          {children}
        </div>
      </main>
    </SidebarProvider>
  )
}
