'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts'

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
  productUsage: {
    carriers: { name: string; count: number }[]
  }
  geography: {
    states: { state: string; count: number }[]
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
      <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-6">
        <div className="text-sm text-[rgba(255,255,255,0.4)]">Loading analytics...</div>
      </div>
    )
  }

  if (!data) return null

  const fa = data.featureAdoption
  const total = fa.totalAdvisors || 1

  return (
    <div className="space-y-6">
      {/* Feature Adoption */}
      <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)] mb-4">
          Feature Adoption
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <AdoptionCard label="Company Name" count={fa.withCompanyName} total={total} />
          <AdoptionCard label="Logo Uploaded" count={fa.withLogo} total={total} />
          <AdoptionCard label="Custom Branding" count={fa.withBranding} total={total} />
          <AdoptionCard label="Team Invites Sent" count={fa.withTeamInvites} total={total} />
          <AdoptionCard label="Team Members Accepted" count={fa.acceptedTeamMembers} total={fa.totalTeamMembers || 0} suffix="invites" />
          <div className="bg-[rgba(255,255,255,0.03)] rounded-xl p-4">
            <p className="text-xs text-[rgba(255,255,255,0.5)] mb-1">Avg Clients / Advisor</p>
            <p className="text-xl font-semibold text-white font-mono">{data.engagement.avgClientsPerAdvisor}</p>
            <p className="text-[10px] text-[rgba(255,255,255,0.4)] mt-1">
              {data.engagement.avgScenariosPerAdvisor} avg scenarios
            </p>
          </div>
        </div>
      </div>

      {/* Product & Geography */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Carriers */}
        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)] mb-4">
            Top Carriers
          </h2>
          {data.productUsage.carriers.length > 0 ? (
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.productUsage.carriers} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis type="number" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 11 }}
                    width={120}
                  />
                  <Tooltip
                    contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
                    itemStyle={{ color: '#d4af37' }}
                  />
                  <Bar dataKey="count" fill="#d4af37" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-[rgba(255,255,255,0.3)]">No carrier data yet</p>
          )}
        </div>

        {/* Top States */}
        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)] mb-4">
            Top States
          </h2>
          {data.geography.states.length > 0 ? (
            <div className="space-y-2 max-h-[250px] overflow-y-auto">
              {data.geography.states.map((s, i) => (
                <div key={s.state} className="flex items-center gap-3">
                  <span className="text-xs text-[rgba(255,255,255,0.4)] w-5 text-right font-mono">{i + 1}</span>
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-sm text-[rgba(255,255,255,0.7)]">{s.state}</span>
                    <div className="flex-1 h-1.5 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#d4af37] rounded-full"
                        style={{ width: `${(s.count / (data.geography.states[0]?.count || 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-xs font-mono text-[rgba(255,255,255,0.5)] w-8 text-right">{s.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[rgba(255,255,255,0.3)]">No state data yet</p>
          )}
        </div>
      </div>

      {/* Subscriptions */}
      <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)] mb-4">
          Subscription Overview
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {/* Plan distribution */}
          {data.subscriptions.plans.map(p => (
            <div key={p.plan} className="bg-[rgba(255,255,255,0.03)] rounded-xl p-4">
              <p className="text-xs text-[rgba(255,255,255,0.5)] mb-1 capitalize">{p.plan} Plan</p>
              <p className="text-xl font-semibold text-white font-mono">{p.count}</p>
            </div>
          ))}
          {/* Active vs inactive */}
          {data.subscriptions.statuses.map(s => (
            <div key={s.status} className="bg-[rgba(255,255,255,0.03)] rounded-xl p-4">
              <p className="text-xs text-[rgba(255,255,255,0.5)] mb-1 capitalize">{s.status}</p>
              <p className="text-xl font-semibold text-white font-mono">{s.count}</p>
            </div>
          ))}
          {/* Billing cycle */}
          {data.subscriptions.cycles.map(c => (
            <div key={c.cycle} className="bg-[rgba(255,255,255,0.03)] rounded-xl p-4">
              <p className="text-xs text-[rgba(255,255,255,0.5)] mb-1 capitalize">{c.cycle}</p>
              <p className="text-xl font-semibold text-white font-mono">{c.count}</p>
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
    <div className="bg-[rgba(255,255,255,0.03)] rounded-xl p-4">
      <p className="text-xs text-[rgba(255,255,255,0.5)] mb-1">{label}</p>
      <p className="text-xl font-semibold text-white font-mono">
        {count} <span className="text-sm text-[rgba(255,255,255,0.4)]">/ {total}</span>
      </p>
      {total > 0 && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-[rgba(255,255,255,0.4)]">{pct}%{suffix ? ` of ${suffix}` : ''}</span>
          </div>
          <div className="h-1.5 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
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
