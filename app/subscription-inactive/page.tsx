import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SubscriptionInactiveContent } from './subscription-inactive-content'

// Server component. Runs the SAME subscription-status check the dashboard
// layout uses, but in REVERSE — if the user IS actually entitled to access
// the dashboard, we redirect them straight there.
//
// This is what makes the page self-healing: anyone who got stuck on this
// route from a transient outage (bad RLS policy, stale Stripe webhook, etc.)
// automatically lands on /dashboard the next time they hit any page in the
// app. No log-out / log-in required.
export default async function SubscriptionInactivePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Not signed in → bounce to login
  if (!user) {
    redirect('/login')
  }

  // Same shape of check the dashboard layout runs
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_active, plan, subscription_status, stripe_customer_id, team_owner_id')
    .eq('id', user.id)
    .single()

  if (profile?.is_active === false) {
    // Truly deactivated — show the static page
    return <SubscriptionInactiveContent />
  }

  // Resolve the effective profile (the team owner's billing if team member,
  // otherwise the user's own).
  let billingProfile = profile
  if (profile?.team_owner_id) {
    const adminClient = createAdminClient()
    const { data: owner } = await adminClient
      .from('profiles')
      .select('plan, subscription_status, stripe_customer_id')
      .eq('id', profile.team_owner_id)
      .single()
    billingProfile = owner ? { ...profile, ...owner } : profile
  }

  const isGrandfathered =
    (billingProfile?.plan === 'pro' || billingProfile?.plan === 'standard') &&
    !billingProfile?.stripe_customer_id
  const hasActiveSubscription =
    ['standard', 'starter', 'pro'].includes(billingProfile?.plan ?? '') &&
    ['active', 'trialing'].includes(billingProfile?.subscription_status ?? '')

  if (isGrandfathered || hasActiveSubscription) {
    // User is actually fine — they got redirected here in error (e.g., from
    // the RLS outage on 2026-05-07). Send them to the dashboard.
    redirect('/dashboard')
  }

  return <SubscriptionInactiveContent />
}
