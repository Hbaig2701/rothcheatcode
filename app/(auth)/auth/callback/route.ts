import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { type EmailOtpType, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'

/**
 * After an email change is confirmed, sync the new email to
 * profiles table and Stripe customer.
 */
async function syncEmailChange(supabase: SupabaseClient) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return

    const adminClient = createAdminClient()

    // Check if profiles.email is already up to date
    const { data: profile } = await adminClient
      .from('profiles')
      .select('email, stripe_customer_id')
      .eq('id', user.id)
      .single()

    if (!profile || profile.email === user.email) return

    // Update profiles table
    await adminClient
      .from('profiles')
      .update({ email: user.email })
      .eq('id', user.id)

    // Update Stripe customer email
    if (profile.stripe_customer_id) {
      await stripe.customers.update(profile.stripe_customer_id, {
        email: user.email,
      }).catch((err: unknown) => console.error('Failed to update Stripe email:', err))
    }

    console.log(`[Auth Callback] Synced email change for user ${user.id}: ${user.email}`)
  } catch (err) {
    console.error('Email sync after confirmation failed:', err)
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const defaultNext = type === 'recovery' ? '/reset-password' : '/dashboard'
  const next = searchParams.get('next') ?? defaultNext

  // Build the redirect URL, using x-forwarded-host on Vercel
  const forwardedHost = request.headers.get('x-forwarded-host')
  const origin = forwardedHost
    ? `https://${forwardedHost}`
    : new URL(request.url).origin

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  // Check if user is deactivated and handle login logging
  const handlePostAuth = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return true
      // Check deactivation status
      const { data: profile } = await supabase.from('profiles').select('is_active').eq('id', user.id).single()
      if (profile?.is_active === false) {
        await supabase.auth.signOut()
        return false // blocked
      }
      // Log login (fire-and-forget)
      supabase.from('login_log').insert({ user_id: user.id }).then(() => {})
      return true
    } catch { return true }
  }

  // Handle PKCE code exchange (OAuth, email with default template)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // If this was an email change confirmation, sync to profiles/Stripe
      if (type === 'email_change') {
        await syncEmailChange(supabase)
      }
      if (type !== 'recovery') {
        const allowed = await handlePostAuth()
        if (!allowed) return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('Your account has been deactivated.')}`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Handle OTP token hash verification (email with custom template)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      // If this was an email change confirmation, sync to profiles/Stripe
      if (type === 'email_change') {
        await syncEmailChange(supabase)
      }
      if (type !== 'recovery') {
        const allowed = await handlePostAuth()
        if (!allowed) return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('Your account has been deactivated.')}`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=Could not authenticate`)
}
