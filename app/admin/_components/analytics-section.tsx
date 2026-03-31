'use client'

import { useEffect, useState } from 'react'
interface AnalyticsData {
  featureAdoption: {
    totalAdvisors: number
    withCompanyName: number
    withLogo: number
    withBranding: number
    withTeamInvites: number
    totalTeamMembers: number
    acceptedTeamMembers: number
  }
  subscriptions: {
    plans: { plan: string; count: number }[]
    statuses: { status: string; count: number }[]
    cycles: { cycle: string; count: number }[]
  }
  engagement: {
    avgClientsPerAdvisor: number
    avgScenariosPerAdvisor: number
  }
}

export function AnalyticsSection() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/analytics')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="bg-bg-card border border-border-default rounded-[14px] p-6">
        <div className="text-sm text-text-dim">Loading analytics...</div>
      </div>
    )
  }

  if (!data) return null

  const fa = data.featureAdoption
  const total = fa.totalAdvisors || 1

  return (
    <div className="space-y-6">
      {/* Feature Adoption */}
      <div className="bg-bg-card border border-border-default rounded-[14px] p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[1.5px] text-text-muted mb-4">
          Feature Adoption
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <AdoptionCard label="Company Name" count={fa.withCompanyName} total={total} />
          <AdoptionCard label="Logo Uploaded" count={fa.withLogo} total={total} />
          <AdoptionCard label="Custom Branding" count={fa.withBranding} total={total} />
          <AdoptionCard label="Team Invites Sent" count={fa.withTeamInvites} total={total} />
          <AdoptionCard label="Team Members Accepted" count={fa.acceptedTeamMembers} total={fa.totalTeamMembers || 0} suffix="invites" />
          <div className="bg-bg-card rounded-xl p-4">
            <p className="text-xs text-text-muted mb-1">Avg Clients / Advisor</p>
            <p className="text-xl font-semibold text-foreground font-mono">{data.engagement.avgClientsPerAdvisor}</p>
            <p className="text-xs text-text-dim mt-1">
              {data.engagement.avgScenariosPerAdvisor} avg scenarios
            </p>
          </div>
        </div>
      </div>

      {/* Subscriptions */}
      <div className="bg-bg-card border border-border-default rounded-[14px] p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[1.5px] text-text-muted mb-4">
          Subscription Overview
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {/* Plan distribution */}
          {data.subscriptions.plans.map(p => (
            <div key={p.plan} className="bg-bg-card rounded-xl p-4">
              <p className="text-xs text-text-muted mb-1 capitalize">{p.plan} Plan</p>
              <p className="text-xl font-semibold text-foreground font-mono">{p.count}</p>
            </div>
          ))}
          {/* Active vs inactive */}
          {data.subscriptions.statuses.map(s => (
            <div key={s.status} className="bg-bg-card rounded-xl p-4">
              <p className="text-xs text-text-muted mb-1 capitalize">{s.status}</p>
              <p className="text-xl font-semibold text-foreground font-mono">{s.count}</p>
            </div>
          ))}
          {/* Billing cycle */}
          {data.subscriptions.cycles.map(c => (
            <div key={c.cycle} className="bg-bg-card rounded-xl p-4">
              <p className="text-xs text-text-muted mb-1 capitalize">{c.cycle}</p>
              <p className="text-xl font-semibold text-foreground font-mono">{c.count}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function AdoptionCard({ label, count, total, suffix }: {
  label: string
  count: number
  total: number
  suffix?: string
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="bg-bg-card rounded-xl p-4">
      <p className="text-xs text-text-muted mb-1">{label}</p>
      <p className="text-xl font-semibold text-foreground font-mono">
        {count} <span className="text-sm text-text-dim">/ {total}</span>
      </p>
      {total > 0 && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-text-dim">{pct}%{suffix ? ` of ${suffix}` : ''}</span>
          </div>
          <div className="h-1.5 bg-bg-card-hover rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                backgroundColor: pct > 50 ? '#4ade80' : pct > 25 ? '#d4af37' : '#ef4444'
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
