import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardContent } from './dashboard-content'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  // Extract first name from email or metadata
  const userName = user.user_metadata?.full_name
    ?? user.email?.split('@')[0]
    ?? 'Agent'

  return <DashboardContent userName={userName} />
}
