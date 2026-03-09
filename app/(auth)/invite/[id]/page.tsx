'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2, Users } from 'lucide-react'

interface InviteData {
  invite: { id: string; email: string; role: string }
  teamOwner: { email: string; companyName: string | null }
}

export default function InvitePage() {
  const params = useParams()
  const router = useRouter()
  const inviteId = params.id as string

  const [invite, setInvite] = useState<InviteData | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [alreadyAccepted, setAlreadyAccepted] = useState(false)

  useEffect(() => {
    fetch(`/api/team/invite/${inviteId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          // Check if this is because invite was already accepted
          if (data.error === 'Invalid or expired invite') {
            setAlreadyAccepted(true)
          }
          setError(data.error)
        } else {
          setInvite(data)
        }
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load invite')
        setLoading(false)
      })
  }, [inviteId])

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setSubmitting(true)

    try {
      const res = await fetch('/api/team/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteId,
          email: invite?.invite.email,
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to accept invite')
        setSubmitting(false)
        return
      }

      // Sign in
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: invite!.invite.email,
        password,
      })

      if (signInError) {
        router.push('/login?message=Invite accepted! Please sign in.')
        return
      }

      router.push('/dashboard')
    } catch {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (alreadyAccepted) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              This invite has already been accepted or has expired.
            </p>
            <a href="/login">
              <Button variant="outline" className="w-full">
                Go to Login
              </Button>
            </a>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error && !invite) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-red-500">{error}</p>
            <a href="/login" className="text-sm text-muted-foreground underline mt-4 inline-block">
              Go to login
            </a>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <img src="/logo.png" alt="Retirement Expert" className="h-10 w-auto" />
        </div>

        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(212,175,55,0.15)]">
              <Users className="h-5 w-5 text-gold" />
            </div>
            <CardTitle>You&apos;ve Been Invited!</CardTitle>
          </CardHeader>

          <CardContent>
            <p className="text-sm text-muted-foreground mb-6 text-center">
              <strong>{invite?.teamOwner.email}</strong> has invited you to join
              {invite?.teamOwner.companyName ? ` ${invite.teamOwner.companyName}` : ' their team'}.
            </p>

            {error && (
              <p className="text-sm text-red-500 mb-4 text-center">{error}</p>
            )}

            <form onSubmit={handleAccept} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={invite?.invite.email ?? ''}
                  disabled
                  className="opacity-70"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Create Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Accept Invite & Join Team
              </Button>
            </form>

            <p className="text-xs text-muted-foreground text-center mt-4">
              Already have an account?{' '}
              <a href="/login" className="underline">Sign in</a>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
