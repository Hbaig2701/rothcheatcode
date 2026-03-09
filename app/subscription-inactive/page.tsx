'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'

export default function SubscriptionInactivePage() {
  const [isTeamMember, setIsTeamMember] = useState<boolean | null>(null)
  const [hasStripeSubscription, setHasStripeSubscription] = useState(false)

  useEffect(() => {
    fetch('/api/billing/usage')
      .then((res) => res.json())
      .then((data) => {
        setIsTeamMember(data.isTeamMember ?? false)
        setHasStripeSubscription(data.hasStripeSubscription ?? false)
      })
      .catch(() => {
        setIsTeamMember(false)
        setHasStripeSubscription(false)
      })
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0c0c0c]">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(245,158,11,0.15)]">
            <AlertCircle className="h-6 w-6 text-[#f59e0b]" />
          </div>
          <CardTitle>Subscription Inactive</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {isTeamMember ? (
            <>
              <p className="text-sm text-muted-foreground">
                Your team owner&apos;s subscription is no longer active. Please contact your team owner to restore access.
              </p>
              <div className="flex flex-col gap-2">
                <a href="/plans">
                  <Button className="w-full">
                    Get Your Own Subscription
                  </Button>
                </a>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Your subscription is no longer active. {hasStripeSubscription
                  ? 'Please update your payment method to continue using the platform.'
                  : 'Please subscribe to continue using the platform.'}
              </p>
              <div className="flex flex-col gap-2">
                {hasStripeSubscription && (
                  <Button
                    className="w-full"
                    onClick={async () => {
                      const res = await fetch('/api/billing/portal', { method: 'POST' })
                      const data = await res.json()
                      if (data.url) window.location.href = data.url
                    }}
                  >
                    Update Payment Method
                  </Button>
                )}

                <a href="/plans">
                  <Button variant={hasStripeSubscription ? "outline" : "default"} className="w-full">
                    {hasStripeSubscription ? 'View Plans' : 'Subscribe Now'}
                  </Button>
                </a>
              </div>
            </>
          )}

          <button
            type="button"
            onClick={async () => {
              try {
                await fetch('/api/auth/signout', { method: 'POST' })
              } catch {
                // Sign out failed, redirect anyway to clear client state
              }
              window.location.href = '/login'
            }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Or sign out
          </button>
        </CardContent>
      </Card>
    </div>
  )
}
