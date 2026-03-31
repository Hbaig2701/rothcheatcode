'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { DollarSign, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'

interface RevenueData {
  current: {
    mrr: number
    arr: number
    activeSubscriptions: number
    avgRevenuePerUser: number
  }
  growth: {
    mrrGrowth: number
    subscriptionGrowth: number
  }
  byPlan: {
    plan: string
    monthlyRevenue: number
    annualRevenue: number
    count: number
  }[]
  byMonth: {
    month: string
    mrr: number
    newSubs: number
    churned: number
  }[]
  trials: {
    active: number
    converted: number
    conversionRate: number
    avgDaysToConvert: number
  }
  health: {
    pastDue: number
    canceled: number
    churnRate: number
  }
}

export function RevenueSection() {
  const [data, setData] = useState<RevenueData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/revenue')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="bg-bg-card border border-border-default rounded-[14px] p-6">
        <div className="text-sm text-text-dim">Loading revenue data...</div>
      </div>
    )
  }

  if (!data) return null

  const hasHealthIssues = data.health.pastDue > 0 || data.health.canceled > 0 || data.health.churnRate > 5

  return (
    <div className="space-y-6">
      {/* Revenue Overview */}
      <div className="bg-bg-card border border-border-default rounded-[14px] p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[1.5px] text-text-muted mb-4">
          Revenue Overview
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <RevenueStat
            label="MRR"
            value={`$${data.current.mrr.toLocaleString()}`}
            trend={data.growth.mrrGrowth}
            subtext="Monthly Recurring Revenue"
          />
          <RevenueStat
            label="ARR"
            value={`$${data.current.arr.toLocaleString()}`}
            subtext="Annual Run Rate"
          />
          <RevenueStat
            label="Active Subscriptions"
            value={data.current.activeSubscriptions}
            trend={data.growth.subscriptionGrowth}
            subtext="Paying customers"
          />
          <RevenueStat
            label="ARPU"
            value={`$${data.current.avgRevenuePerUser.toFixed(0)}`}
            subtext="Avg Revenue Per User"
          />
        </div>
      </div>

      {/* Health Alerts */}
      {hasHealthIssues && (
        <div className="bg-bg-card border border-border-default rounded-[14px] p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[1.5px] text-text-muted mb-4 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-[#ef4444]" />
            Subscription Health Alerts
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {data.health.pastDue > 0 && (
              <HealthAlert
                label="Failed Payments"
                count={data.health.pastDue}
                description="Subscriptions with payment issues"
                severity="warning"
              />
            )}
            {data.health.canceled > 0 && (
              <HealthAlert
                label="Canceled"
                count={data.health.canceled}
                description="Recently canceled subscriptions"
                severity="danger"
              />
            )}
            {data.health.churnRate > 5 && (
              <HealthAlert
                label="Churn Rate"
                count={`${data.health.churnRate.toFixed(1)}%`}
                description="Above 5% threshold"
                severity="warning"
              />
            )}
          </div>
        </div>
      )}

      {/* Revenue Breakdown */}
      {data.byPlan.length > 0 && (
        <div className="bg-bg-card border border-border-default rounded-[14px] p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[1.5px] text-text-muted mb-4">
            Revenue Breakdown
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.byPlan.map(p => {
              const monthlyCount = p.monthlyRevenue > 0 ? Math.round(p.monthlyRevenue / 197) : 0;
              const annualCount = p.annualRevenue > 0 ? Math.round(p.annualRevenue / 1970) : 0;
              return (
                <div key={p.plan}>
                  {monthlyCount > 0 && (
                    <div className="bg-bg-card rounded-xl p-4 mb-2">
                      <p className="text-xs text-text-muted mb-1">Monthly Subscribers</p>
                      <p className="text-xl font-semibold text-foreground font-mono">
                        ${p.monthlyRevenue.toLocaleString()}
                        <span className="text-xs text-text-dim">/mo</span>
                      </p>
                      <p className="text-xs text-text-dim mt-1">
                        {monthlyCount} {monthlyCount === 1 ? 'subscriber' : 'subscribers'}
                      </p>
                    </div>
                  )}
                  {annualCount > 0 && (
                    <div className="bg-bg-card rounded-xl p-4">
                      <p className="text-xs text-text-muted mb-1">Annual Subscribers</p>
                      <p className="text-xl font-semibold text-foreground font-mono">
                        ${p.annualRevenue.toLocaleString()}
                        <span className="text-xs text-text-dim">/yr</span>
                      </p>
                      <p className="text-xs text-text-dim mt-1">
                        {annualCount} {annualCount === 1 ? 'subscriber' : 'subscribers'}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Conversion Performance */}
      <div className="bg-bg-card border border-border-default rounded-[14px] p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[1.5px] text-text-muted mb-4">
          Conversion Performance
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <TrialStat label="Trial Users" value={data.trials.active} subtext="haven't paid yet" />
          <TrialStat label="Paying Users" value={data.trials.converted} subtext="active subscriptions" />
          <TrialStat
            label="Conversion Rate"
            value={`${data.trials.conversionRate.toFixed(1)}%`}
            highlight={data.trials.conversionRate >= 50}
            subtext="trial → paying"
          />
        </div>
      </div>

      {/* MRR Trend */}
      <div className="bg-bg-card border border-border-default rounded-[14px] p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[1.5px] text-text-muted mb-4">
          MRR Trend (Last 6 Months)
        </h2>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.byMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="month"
                tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
              />
              <YAxis
                tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                tickFormatter={(val) => `$${val}`}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 8,
                  fontSize: 12
                }}
                labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
                formatter={(value: number | undefined) => value != null ? [`$${value}`, 'MRR'] : ['$0', 'MRR']}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }} />
              <Bar dataKey="mrr" name="MRR" fill="#d4af37" radius={[3, 3, 0, 0]} />
              <Bar dataKey="newSubs" name="New Subs" fill="#4ade80" radius={[3, 3, 0, 0]} />
              <Bar dataKey="churned" name="Churned" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

function RevenueStat({
  label,
  value,
  trend,
  subtext
}: {
  label: string
  value: string | number
  trend?: number
  subtext: string
}) {
  return (
    <div className="bg-bg-card rounded-xl p-4">
      <p className="text-xs text-text-muted mb-1">{label}</p>
      <p className="text-2xl font-semibold text-foreground font-mono mb-1">{value}</p>
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-dim">{subtext}</span>
        {trend != null && trend !== 0 && (
          <span className={`flex items-center gap-0.5 text-xs font-medium ${trend > 0 ? 'text-green' : 'text-[#ef4444]'}`}>
            {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trend > 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
    </div>
  )
}

function HealthAlert({
  label,
  count,
  description,
  severity
}: {
  label: string
  count: number | string
  description: string
  severity: 'warning' | 'danger'
}) {
  const colors = severity === 'danger'
    ? 'bg-[rgba(239,68,68,0.15)] border-[rgba(239,68,68,0.2)] text-[#ef4444]'
    : 'bg-[rgba(245,158,11,0.15)] border-[rgba(245,158,11,0.2)] text-[#f59e0b]'

  return (
    <div className={`rounded-xl p-4 border ${colors}`}>
      <p className="text-xs opacity-80 mb-1">{label}</p>
      <p className="text-2xl font-semibold font-mono mb-1">{count}</p>
      <p className="text-xs opacity-70">{description}</p>
    </div>
  )
}

function TrialStat({
  label,
  value,
  subtext,
  highlight
}: {
  label: string
  value: number | string
  subtext?: string
  highlight?: boolean
}) {
  return (
    <div className="bg-bg-card rounded-xl p-4">
      <p className="text-xs text-text-muted mb-1">{label}</p>
      <p className={`text-xl font-semibold font-mono ${highlight ? 'text-green' : 'text-foreground'}`}>
        {value}
      </p>
      {subtext && (
        <p className="text-xs text-text-dim mt-1">{subtext}</p>
      )}
    </div>
  )
}
