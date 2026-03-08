import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardContent } from './dashboard-content'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  // Extract display name from user_settings
  const { data: userSettings } = await supabase
    .from('user_settings')
    .select('first_name, last_name')
    .eq('user_id', user.id)
    .single()

  const userName = [userSettings?.first_name, userSettings?.last_name].filter(Boolean).join(' ')
    || user.user_metadata?.full_name
    || user.email?.split('@')[0]
    || 'Agent'

  return <DashboardContent userName={userName} />
}
