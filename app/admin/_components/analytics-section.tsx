'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Heart, Shield } from 'lucide-react'

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
  mrr: number
  risk: 'critical' | 'high' | 'medium' | 'healthy'
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

  // Score distribution
  const excellent = data.healthScores.filter(h => h.score >= 75).length
  const good = data.healthScores.filter(h => h.score >= 50 && h.score < 75).length
  const atrisk = data.healthScores.filter(h => h.score >= 25 && h.score < 50).length
  const critical = data.healthScores.filter(h => h.score < 25).length

  // MRR exposure on accounts that need attention (anyone scoring under 50).
  // This replaces the old standalone "Revenue at Risk" section — same number,
  // just folded into a single panel.
  const atRiskMRR = data.healthScores
    .filter(h => h.score < 50)
    .reduce((sum, h) => sum + (h.mrr || 0), 0)

  // Show the bottom 10 advisors needing attention. Skip "healthy" so the
  // panel is actually actionable when most of the book is doing fine.
  const needsAttention = data.healthScores
    .filter(h => h.score < 75)
    .slice(0, 10)

  return (
    <div className="space-y-6">
      {/* Advisor Health (merged: Revenue at Risk + Health Scores) */}
      <div className="bg-bg-card border border-border-default rounded-[14px] p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-[1.5px] text-text-muted flex items-center gap-2">
            <Heart className="h-4 w-4 text-[#d4af37]" />
            Advisor Health
          </h2>
          {atRiskMRR > 0 && (
            <span className="text-xs text-text-dim">
              MRR on at-risk accounts (score &lt; 50):{' '}
              <span className="font-mono font-semibold text-[#ef4444]">${atRiskMRR.toLocaleString()}/mo</span>
            </span>
          )}
        </div>

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

        {/* Single ranked list — score, MRR, last login, recent activity */}
        {needsAttention.length > 0 ? (
          <>
            <p className="text-xs text-text-muted mb-2">Top {needsAttention.length} advisors needing attention:</p>
            <div className="space-y-1">
              {needsAttention.map(h => (
                <Link
                  key={h.id}
                  href={`/admin/advisors/${h.id}`}
                  className="flex items-center justify-between p-2.5 rounded-lg hover:bg-bg-card-hover transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <HealthBadge score={h.score} />
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">{h.name ?? h.email}</p>
                      {h.name && <p className="text-xs text-text-dim truncate">{h.email}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-5 text-xs text-text-dim shrink-0">
                    <span className="font-mono text-[#ef4444] w-16 text-right">
                      {h.mrr > 0 ? `$${h.mrr}/mo` : '—'}
                    </span>
                    <span className="w-20 text-right tabular-nums">
                      {h.daysSinceLogin >= 999 ? 'Never' : `${h.daysSinceLogin}d ago`}
                    </span>
                    <span className="w-24 text-right tabular-nums">
                      {h.recentScenarios}s · {h.recentExports}e (30d)
                    </span>
                    <span className="w-16 text-right tabular-nums">
                      {h.totalClients} client{h.totalClients === 1 ? '' : 's'}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-text-dim text-center py-6">
            All advisors scoring 75+. Nothing to action right now.
          </p>
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
