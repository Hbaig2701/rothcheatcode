'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Check } from 'lucide-react'
import Link from 'next/link'

const PLANS = {
  standard: {
    name: 'Full Access',
    monthly: 297,
    annual: 2970,
    features: [
      'Unlimited clients',
      'Unlimited scenario runs',
      'Unlimited PDF exports',
      'All product archetypes',
      'Story mode included',
      'Full white-label branding',
      'Priority support (24hr)',
      'Unlimited team members',
    ],
  },
  // ARCHIVED: Legacy plans — can be re-enabled if needed
  // starter: {
  //   name: 'Starter',
  //   monthly: 97,
  //   annual: 970,
  //   features: [
  //     '10 active clients',
  //     '50 scenario runs / month',
  //     '20 PDF exports / month',
  //     'All product archetypes',
  //     'Story mode included',
  //     'Platform branding on reports',
  //     'Email support (48hr)',
  //   ],
  // },
  // pro: {
  //   name: 'Premium',
  //   monthly: 297,
  //   annual: 2970,
  //   features: [...],
  // },
}

export default function PricingPage() {
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly')

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mb-4">
        <img src="/logo.png" alt="Retirement Expert" className="h-10 w-auto" />
      </div>

      <h1 className="mb-2 text-center text-3xl font-semibold text-foreground">
        Choose Your Plan
      </h1>
      <p className="mb-8 text-center text-muted-foreground">
        Start growing your retirement planning practice today.
      </p>

      {/* Cycle Toggle */}
      <div className="mb-10 flex items-center gap-3 rounded-full border border-border-default bg-bg-card p-1">
        <button
          onClick={() => setCycle('monthly')}
          className={`rounded-full px-5 py-2 text-sm font-medium transition-all ${
            cycle === 'monthly'
              ? 'bg-gold text-black'
              : 'text-muted-foreground hover:text-white'
          }`}
        >
          Monthly
        </button>
        <button
          onClick={() => setCycle('annual')}
          className={`rounded-full px-5 py-2 text-sm font-medium transition-all ${
            cycle === 'annual'
              ? 'bg-gold text-black'
              : 'text-muted-foreground hover:text-white'
          }`}
        >
          Annual
          <span className="ml-1.5 text-xs opacity-80">Save 2 months</span>
        </button>
      </div>

      {/* Plan Card */}
      <div className="flex w-full max-w-md justify-center">
        {(Object.entries(PLANS) as [string, typeof PLANS.standard][]).map(
          ([key, plan]) => (
            <Card
              key={key}
              className="relative w-full overflow-visible border-gold/30 shadow-[0_0_30px_rgba(212,175,55,0.1)]"
            >
              <CardHeader className="text-center">
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <div className="mt-2">
                  <span className="text-4xl font-bold text-foreground">
                    ${cycle === 'monthly' ? plan.monthly : plan.annual}
                  </span>
                  <span className="text-muted-foreground">
                    /{cycle === 'monthly' ? 'mo' : 'yr'}
                  </span>
                </div>
                {cycle === 'annual' && (
                  <p className="text-xs text-gold">2 months free</p>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-sm"
                    >
                      <Check className="mt-0.5 size-4 shrink-0 text-gold" />
                      <span className="text-text-muted">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                <a
                  href={`/api/checkout?plan=${key}&cycle=${cycle}`}
                  className="flex h-10 w-full cursor-pointer items-center justify-center rounded-md bg-gold text-sm font-medium text-black transition-colors hover:bg-gold/90"
                >
                  Get Started
                </a>
              </CardContent>
            </Card>
          )
        )}
      </div>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="text-gold underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
