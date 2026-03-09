'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react'

interface CostsData {
  pdfExports: {
    thisMonth: number
    lastMonth: number
    trend: number
    byMonth: { month: string; count: number }[]
  }
  scenarioRuns: {
    thisMonth: number
    lastMonth: number
    trend: number
    byMonth: { month: string; count: number }[]
  }
  computation: { avgCalcMs: number }
  storage: { estimatedMB: number; imageCount: number }
  costEstimates: { pdf: number; scenario: number; storage: number; total: number }
  alerts: { pdfSpike: boolean; scenarioSpike: boolean; highCalcTime: boolean }
}

export function CostsSection() {
  const [data, setData] = useState<CostsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/costs')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-6">
        <div className="text-sm text-[rgba(255,255,255,0.55)]">Loading costs...</div>
      </div>
    )
  }

  if (!data) return null

  // Combine by-month data for dual chart
  const chartData = data.pdfExports.byMonth.map((e, i) => ({
    month: e.month,
    exports: e.count,
    scenarios: data.scenarioRuns.byMonth[i]?.count ?? 0,
  }))

  const hasAlerts = data.alerts.pdfSpike || data.alerts.scenarioSpike || data.alerts.highCalcTime

  return (
    <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-6 space-y-6">
      <h2 className="text-sm font-semibold uppercase tracking-[1.5px] text-[rgba(255,255,255,0.65)]">
        Usage & Costs
      </h2>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniStat
          label="PDF Exports"
          value={data.pdfExports.thisMonth}
          subtext="this month"
          trend={data.pdfExports.trend}
        />
        <MiniStat
          label="Scenario Runs"
          value={data.scenarioRuns.thisMonth}
          subtext="this month"
          trend={data.scenarioRuns.trend}
        />
        <MiniStat
          label="Avg Calc Time"
          value={`${(data.computation.avgCalcMs / 1000).toFixed(1)}s`}
          subtext="this month"
        />
        <MiniStat
          label="Est. Monthly Cost"
          value={`$${data.costEstimates.total.toFixed(2)}`}
          subtext="estimated"
        />
      </div>

      {/* Usage Chart */}
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="month" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }} />
            <YAxis tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }} />
            <Bar dataKey="exports" name="PDF Exports" fill="#d4af37" radius={[3, 3, 0, 0]} />
            <Bar dataKey="scenarios" name="Scenarios" fill="#60a5fa" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Cost Breakdown */}
      <div className="overflow-hidden rounded-lg border border-[rgba(255,255,255,0.07)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[rgba(255,255,255,0.03)]">
              <th className="text-left px-4 py-2 text-xs uppercase tracking-[1px] text-[rgba(255,255,255,0.65)]">Category</th>
              <th className="text-right px-4 py-2 text-xs uppercase tracking-[1px] text-[rgba(255,255,255,0.65)]">Units</th>
              <th className="text-right px-4 py-2 text-xs uppercase tracking-[1px] text-[rgba(255,255,255,0.65)]">Est. Cost</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-[rgba(255,255,255,0.05)]">
              <td className="px-4 py-2 text-[rgba(255,255,255,0.7)]">PDF Exports</td>
              <td className="px-4 py-2 text-right font-mono text-[rgba(255,255,255,0.6)]">{data.pdfExports.thisMonth}</td>
              <td className="px-4 py-2 text-right font-mono text-[rgba(255,255,255,0.6)]">${data.costEstimates.pdf.toFixed(2)}</td>
            </tr>
            <tr className="border-t border-[rgba(255,255,255,0.05)]">
              <td className="px-4 py-2 text-[rgba(255,255,255,0.7)]">Scenario Runs</td>
              <td className="px-4 py-2 text-right font-mono text-[rgba(255,255,255,0.6)]">{data.scenarioRuns.thisMonth}</td>
              <td className="px-4 py-2 text-right font-mono text-[rgba(255,255,255,0.6)]">${data.costEstimates.scenario.toFixed(2)}</td>
            </tr>
            <tr className="border-t border-[rgba(255,255,255,0.05)]">
              <td className="px-4 py-2 text-[rgba(255,255,255,0.7)]">Storage ({data.storage.imageCount} images)</td>
              <td className="px-4 py-2 text-right font-mono text-[rgba(255,255,255,0.6)]">{data.storage.estimatedMB} MB</td>
              <td className="px-4 py-2 text-right font-mono text-[rgba(255,255,255,0.6)]">${data.costEstimates.storage.toFixed(4)}</td>
            </tr>
            <tr className="border-t border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.02)]">
              <td className="px-4 py-2 font-medium text-white">Total</td>
              <td className="px-4 py-2"></td>
              <td className="px-4 py-2 text-right font-mono font-medium text-[#d4af37]">${data.costEstimates.total.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Alerts */}
      {hasAlerts && (
        <div className="space-y-2">
          {data.alerts.pdfSpike && (
            <AlertBadge message="PDF exports are 2x+ higher than last month" />
          )}
          {data.alerts.scenarioSpike && (
            <AlertBadge message="Scenario runs are 2x+ higher than last month" />
          )}
          {data.alerts.highCalcTime && (
            <AlertBadge message={`Average calculation time is ${(data.computation.avgCalcMs / 1000).toFixed(1)}s (>5s threshold)`} />
          )}
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, value, subtext, trend }: {
  label: string
  value: number | string
  subtext: string
  trend?: number
}) {
  return (
    <div className="bg-[rgba(255,255,255,0.03)] rounded-xl p-4">
      <p className="text-xs text-[rgba(255,255,255,0.65)] mb-1">{label}</p>
      <p className="text-xl font-semibold text-white font-mono">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      <div className="flex items-center gap-1 mt-1">
        <span className="text-xs text-[rgba(255,255,255,0.55)]">{subtext}</span>
        {trend != null && trend !== 0 && (
          <span className={`flex items-center gap-0.5 text-xs ${trend > 0 ? 'text-[#4ade80]' : 'text-[#ef4444]'}`}>
            {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trend > 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
    </div>
  )
}

function AlertBadge({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)]">
      <AlertTriangle className="h-4 w-4 text-[#ef4444] flex-shrink-0" />
      <span className="text-xs text-[#ef4444]">{message}</span>
    </div>
  )
}
