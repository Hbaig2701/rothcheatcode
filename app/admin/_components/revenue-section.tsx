'use client'

import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'

interface RevenueData {
  current: {
    mrr: number
    arr: number
    activeSubscriptions: number
    avgRevenuePerUser: number
    totalCashCollected: number
  }
  growth: {
    mrrGrowth: number
  }
  breakdown: {
    monthly: { count: number; revenue: number }
    annual: { count: number; revenue: number }
  }
  mrrTrend: {
    month: string
    mrr: number
    arr: number
    subscribers: number
  }[]
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
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
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
            label="Total Cash Collected"
            value={`$${data.current.totalCashCollected.toLocaleString()}`}
            subtext="Lifetime revenue"
          />
          <RevenueStat
            label="Active Subscriptions"
            value={data.current.activeSubscriptions}
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
                label="Churned"
                count={data.health.canceled}
                description="Canceled subscriptions"
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
      <div className="bg-bg-card border border-border-default rounded-[14px] p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[1.5px] text-text-muted mb-4">
          Revenue Breakdown
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.breakdown.monthly.count > 0 && (
            <div className="bg-bg-card rounded-xl p-4">
              <p className="text-xs text-text-muted mb-1">Monthly Subscribers</p>
              <p className="text-xl font-semibold text-foreground font-mono">
                ${data.breakdown.monthly.revenue.toLocaleString()}
                <span className="text-xs text-text-dim">/mo</span>
              </p>
              <p className="text-xs text-text-dim mt-1">
                {data.breakdown.monthly.count} {data.breakdown.monthly.count === 1 ? 'subscriber' : 'subscribers'}
              </p>
            </div>
          )}
          {data.breakdown.annual.count > 0 && (
            <div className="bg-bg-card rounded-xl p-4">
              <p className="text-xs text-text-muted mb-1">Annual Subscribers</p>
              <p className="text-xl font-semibold text-foreground font-mono">
                ${data.breakdown.annual.revenue.toLocaleString()}
                <span className="text-xs text-text-dim">/yr</span>
              </p>
              <p className="text-xs text-text-dim mt-1">
                {data.breakdown.annual.count} {data.breakdown.annual.count === 1 ? 'subscriber' : 'subscribers'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* MRR & ARR Growth Trend (Line Chart) */}
      <div className="bg-bg-card border border-border-default rounded-[14px] p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[1.5px] text-text-muted mb-4">
          MRR & ARR Growth (Last 6 Months)
        </h2>
        <div className="h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.mrrTrend} margin={{ top: 10, right: 30, left: 30, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.2)" />
              <XAxis
                dataKey="month"
                tick={{ fill: '#6b7280', fontSize: 12 }}
                label={{ value: 'Month', position: 'insideBottom', offset: -15, style: { fill: '#6b7280', fontSize: 11 } }}
              />
              <YAxis
                yAxisId="mrr"
                tick={{ fill: '#6b7280', fontSize: 12 }}
                tickFormatter={(val) => `$${val.toLocaleString()}`}
                label={{ value: 'MRR ($)', angle: -90, position: 'insideLeft', offset: 5, style: { fill: '#6b7280', fontSize: 11, textAnchor: 'middle' } }}
              />
              <YAxis
                yAxisId="arr"
                orientation="right"
                tick={{ fill: '#6b7280', fontSize: 12 }}
                tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                label={{ value: 'ARR ($)', angle: 90, position: 'insideRight', offset: 5, style: { fill: '#6b7280', fontSize: 11, textAnchor: 'middle' } }}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 8,
                  fontSize: 12
                }}
                labelStyle={{ color: '#4b5563' }}
                formatter={(value, name) => {
                  const v = (value as number) ?? 0
                  if (name === 'Subscribers') return [v, name]
                  return [`$${v.toLocaleString()}`, name]
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: '#6b7280' }} />
              <Line
                yAxisId="mrr"
                type="monotone"
                dataKey="mrr"
                name="MRR"
                stroke="#d4af37"
                strokeWidth={2.5}
                dot={{ fill: '#d4af37', r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line
                yAxisId="arr"
                type="monotone"
                dataKey="arr"
                name="ARR"
                stroke="#4ade80"
                strokeWidth={2}
                dot={{ fill: '#4ade80', r: 3 }}
                strokeDasharray="5 5"
              />
              <Line
                yAxisId="mrr"
                type="monotone"
                dataKey="subscribers"
                name="Subscribers"
                stroke="#3b82f6"
                strokeWidth={1.5}
                dot={{ fill: '#3b82f6', r: 3 }}
              />
            </LineChart>
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
