import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { PaymentFailedBanner } from '@/components/payment-failed-banner'
import { PaymentWallModal } from '@/components/payment-wall-modal'

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
    .select('is_active, plan, subscription_status, stripe_customer_id, team_owner_id, role')
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

    const ownerGrandfathered = (owner?.plan === 'pro' || owner?.plan === 'standard') && !owner?.stripe_customer_id
    const ownerActive = ['standard', 'starter', 'pro'].includes(owner?.plan ?? '') && ['active', 'trialing'].includes(owner?.subscription_status ?? '')

    if (!ownerGrandfathered && !ownerActive) {
      redirect('/subscription-inactive')
    }
  } else {
    // Owner or independent user
    const isGrandfathered = (profile?.plan === 'pro' || profile?.plan === 'standard') && !profile?.stripe_customer_id
    const hasActiveSubscription =
      ['standard', 'starter', 'pro'].includes(profile?.plan ?? '') && ['active', 'trialing'].includes(profile?.subscription_status ?? '')

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

  // Log app visit (throttled: max once per hour per user)
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString()
  const visitLogger = createAdminClient()
  Promise.resolve(
    visitLogger
      .from('login_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', oneHourAgo)
      .then(({ count }) => {
        if ((count ?? 0) === 0) {
          visitLogger.from('login_log').insert({ user_id: user.id }).then(() => {})
        }
      })
  ).catch(() => {})

  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get('sidebar_state')?.value !== 'false'

  return (
    <SidebarProvider defaultOpen={defaultOpen} className="bg-sidebar">
      <AppSidebar user={user} displayName={displayName} userRole={profile?.role ?? null} />
      <main className="flex-1 min-w-0 flex flex-col min-h-screen bg-background">
        <PaymentFailedBanner
          subscriptionStatus={profile?.subscription_status ?? null}
          isTeamMember={!!profile?.team_owner_id}
        />
        <div className="flex-1">
          {children}
        </div>
      </main>

      {/*
        🚀 PAYMENT WALL - ACTIVATED 🚀

        Payment wall is now LIVE as of March 16, 2026.

        Blocking 12 grandfathered users who don't have Stripe subscriptions.
        Paying users (2) and admins continue with normal access.

        To disable: Change enabled={true} back to enabled={false}
      */}
      <PaymentWallModal enabled={true} />
    </SidebarProvider>
  )
}
