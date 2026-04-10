'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Heart, Shield } from 'lucide-react'

interface HealthScore {
  id: string
  email: string
  name: string | null
  score: number
  daysSinceLogin: number
  recentLogins: number
  recentScenarios: number
  recentExports: number
  totalClients: number
}

interface AtRiskAdvisor extends HealthScore {
  mrr: number
  risk: 'high' | 'medium' | 'low'
}

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
  engagement: {
    avgClientsPerAdvisor: number
    avgScenariosPerAdvisor: number
  }
  healthScores: HealthScore[]
  revenueAtRisk: AtRiskAdvisor[]
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
  const totalAtRiskMRR = data.revenueAtRisk.reduce((sum, a) => sum + a.mrr, 0)

  // Score distribution
  const excellent = data.healthScores.filter(h => h.score >= 75).length
  const good = data.healthScores.filter(h => h.score >= 50 && h.score < 75).length
  const atrisk = data.healthScores.filter(h => h.score >= 25 && h.score < 50).length
  const critical = data.healthScores.filter(h => h.score < 25).length

  return (
    <div className="space-y-6">
      {/* Revenue at Risk */}
      {data.revenueAtRisk.length > 0 && (
        <div className="bg-bg-card border border-border-default rounded-[14px] p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[1.5px] text-text-muted mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[#f59e0b]" />
            Revenue at Risk
            <span className="text-xs font-mono text-[#ef4444] ml-2">
              ${totalAtRiskMRR.toLocaleString()}/mo
            </span>
          </h2>
          <div className="space-y-2">
            {data.revenueAtRisk.slice(0, 10).map(a => (
              <Link
                key={a.id}
                href={`/admin/advisors/${a.id}`}
                className="flex items-center justify-between p-3 rounded-lg bg-bg-card hover:bg-bg-card-hover transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${
                    a.risk === 'high' ? 'bg-[#ef4444]' : a.risk === 'medium' ? 'bg-[#f59e0b]' : 'bg-[#3b82f6]'
                  }`} />
                  <div>
                    <p className="text-sm text-foreground">{a.name ?? a.email}</p>
                    {a.name && <p className="text-xs text-text-dim">{a.email}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <div>
                    <p className="text-xs text-text-dim">Last login</p>
                    <p className="text-sm font-mono text-text-muted">
                      {a.daysSinceLogin >= 999 ? 'Never' : `${a.daysSinceLogin}d ago`}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-dim">30d activity</p>
                    <p className="text-sm font-mono text-text-muted">
                      {a.recentScenarios}s / {a.recentExports}e
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-dim">MRR</p>
                    <p className="text-sm font-mono font-medium text-[#ef4444]">
                      ${a.mrr}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-dim">Health</p>
                    <HealthBadge score={a.score} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Advisor Health Scores */}
      <div className="bg-bg-card border border-border-default rounded-[14px] p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[1.5px] text-text-muted mb-4 flex items-center gap-2">
          <Heart className="h-4 w-4 text-[#d4af37]" />
          Advisor Health Scores
        </h2>

        {/* Distribution summary */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="bg-bg-card rounded-xl p-3 text-center">
            <p className="text-xs text-text-dim mb-1">Excellent (75+)</p>
            <p className="text-xl font-semibold font-mono text-green">{excellent}</p>
          </div>
          <div className="bg-bg-card rounded-xl p-3 text-center">
            <p className="text-xs text-text-dim mb-1">Good (50-74)</p>
            <p className="text-xl font-semibold font-mono text-[#3b82f6]">{good}</p>
          </div>
          <div className="bg-bg-card rounded-xl p-3 text-center">
            <p className="text-xs text-text-dim mb-1">At Risk (25-49)</p>
            <p className="text-xl font-semibold font-mono text-[#f59e0b]">{atrisk}</p>
          </div>
          <div className="bg-bg-card rounded-xl p-3 text-center">
            <p className="text-xs text-text-dim mb-1">Critical (&lt;25)</p>
            <p className="text-xl font-semibold font-mono text-[#ef4444]">{critical}</p>
          </div>
        </div>

        {/* Bottom 10 advisors (lowest health) */}
        {data.healthScores.length > 0 && (
          <>
            <p className="text-xs text-text-muted mb-2">Lowest health advisors:</p>
            <div className="space-y-1">
              {data.healthScores.slice(0, 10).map(h => (
                <Link
                  key={h.id}
                  href={`/admin/advisors/${h.id}`}
                  className="flex items-center justify-between p-2.5 rounded-lg hover:bg-bg-card-hover transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <HealthBadge score={h.score} />
                    <div>
                      <p className="text-sm text-foreground">{h.name ?? h.email}</p>
                      {h.name && <p className="text-xs text-text-dim">{h.email}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-xs text-text-dim">
                    <span>{h.totalClients} clients</span>
                    <span>{h.recentLogins} logins (30d)</span>
                    <span>{h.recentScenarios} scenarios (30d)</span>
                    <span>
                      {h.daysSinceLogin >= 999 ? 'Never logged in' : `Last login ${h.daysSinceLogin}d ago`}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Feature Adoption */}
      <div className="bg-bg-card border border-border-default rounded-[14px] p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[1.5px] text-text-muted mb-4 flex items-center gap-2">
          <Shield className="h-4 w-4 text-[#d4af37]" />
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
    </div>
  )
}

function HealthBadge({ score }: { score: number }) {
  const color = score >= 75 ? 'bg-[rgba(74,222,128,0.15)] text-green'
    : score >= 50 ? 'bg-[rgba(59,130,246,0.15)] text-[#3b82f6]'
    : score >= 25 ? 'bg-[rgba(245,158,11,0.15)] text-[#f59e0b]'
    : 'bg-[rgba(239,68,68,0.15)] text-[#ef4444]'

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-medium ${color}`}>
      {score}
    </span>
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
