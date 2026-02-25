import { SupabaseClient, User } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'

export async function requireAdmin(supabase: SupabaseClient, user: User) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (error || profile?.role !== 'admin') {
    redirect('/dashboard')
  }

  return profile
}

export async function isAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()

  return profile?.role === 'admin'
}
