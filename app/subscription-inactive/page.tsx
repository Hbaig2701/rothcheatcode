'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'

export default function SubscriptionInactivePage() {
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
          <p className="text-sm text-muted-foreground">
            Your subscription is no longer active. Please update your payment method or subscribe to continue using the platform.
          </p>

          <div className="flex flex-col gap-2">
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

            <a href="/plans">
              <Button variant="outline" className="w-full">
                View Plans
              </Button>
            </a>
          </div>

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
