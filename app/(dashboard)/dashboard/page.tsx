import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
      <p className="text-muted-foreground">
        Welcome, {user.email}
      </p>
    </div>
  )
}
