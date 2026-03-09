'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Check } from 'lucide-react'
import Link from 'next/link'

const PLANS = {
  starter: {
    name: 'Starter',
    monthly: 97,
    annual: 970,
    features: [
      '10 active clients',
      '50 scenario runs / month',
      '20 PDF exports / month',
      'All product archetypes',
      'Story mode included',
      'Platform branding on reports',
      'Email support (48hr)',
    ],
  },
  pro: {
    name: 'Premium',
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
    popular: true,
  },
}

export default function PricingPage() {
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly')

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0c0c0c] px-4 py-12">
      <div className="mb-4">
        <img src="/logo.png" alt="Retirement Expert" className="h-10 w-auto" />
      </div>

      <h1 className="mb-2 text-center text-3xl font-semibold text-white">
        Choose Your Plan
      </h1>
      <p className="mb-8 text-center text-muted-foreground">
        Start growing your retirement planning practice today.
      </p>

      {/* Cycle Toggle */}
      <div className="mb-10 flex items-center gap-3 rounded-full border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] p-1">
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

      {/* Plan Cards */}
      <div className="grid w-full max-w-3xl grid-cols-1 gap-6 md:grid-cols-2">
        {(Object.entries(PLANS) as [string, typeof PLANS.starter & { popular?: boolean }][]).map(
          ([key, plan]) => (
            <Card
              key={key}
              className={`relative overflow-visible ${
                plan.popular
                  ? 'border-gold/30 shadow-[0_0_30px_rgba(212,175,55,0.1)]'
                  : ''
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-gold px-4 py-1 text-xs font-semibold text-black">
                  Most Popular
                </div>
              )}
              <CardHeader className="text-center">
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <div className="mt-2">
                  <span className="text-4xl font-bold text-white">
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
                      <span className="text-[rgba(255,255,255,0.7)]">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                <a
                  href={`/api/checkout?plan=${key}&cycle=${cycle}`}
                  className={`flex h-10 w-full cursor-pointer items-center justify-center rounded-md text-sm font-medium transition-colors ${
                    plan.popular
                      ? 'bg-gold text-black hover:bg-gold/90'
                      : 'border border-[rgba(255,255,255,0.15)] text-white hover:bg-[rgba(255,255,255,0.05)]'
                  }`}
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
