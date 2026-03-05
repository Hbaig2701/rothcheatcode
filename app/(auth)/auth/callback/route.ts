import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { type EmailOtpType } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

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
      if (type !== 'recovery') {
        const allowed = await handlePostAuth()
        if (!allowed) return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('Your account has been deactivated.')}`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=Could not authenticate`)
}
