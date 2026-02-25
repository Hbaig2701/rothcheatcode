'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

interface Stats {
  totalAdvisors: number
  totalClients: number
  totalScenarioRuns: number
  totalExports: number
  trendsThisWeek: {
    advisors: number
    clients: number
    scenarioRuns: number
    exports: number
  }
}

interface Advisor {
  id: string
  email: string
  createdAt: string
  clientCount: number
  scenarioRunCount: number
  exportCount: number
  lastLogin: string | null
  status: 'active' | 'inactive'
}

interface ActivityPoint {
  date: string
  count: number
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [advisors, setAdvisors] = useState<Advisor[]>([])
  const [activity, setActivity] = useState<ActivityPoint[]>([])
  const [activityType, setActivityType] = useState<'scenario_runs' | 'exports' | 'logins'>('scenario_runs')
  const [activityRange, setActivityRange] = useState<'7d' | '30d' | '90d'>('30d')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/stats').then(r => r.json()),
      fetch('/api/admin/advisors').then(r => r.json()),
    ]).then(([s, a]) => {
      setStats(s)
      setAdvisors(a.advisors ?? [])
      setLoading(false)
    }).catch(console.error)
  }, [])

  useEffect(() => {
    fetch(`/api/admin/activity?type=${activityType}&range=${activityRange}`)
      .then(r => r.json())
      .then(d => setActivity(d.data ?? []))
      .catch(console.error)
  }, [activityType, activityRange])

  // Filter advisors client-side
  const filtered = advisors.filter(a => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false
    if (search && !a.email.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-[rgba(255,255,255,0.4)]">Loading dashboard...</div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Advisors" value={stats?.totalAdvisors ?? 0} trend={stats?.trendsThisWeek.advisors} />
        <StatCard label="Total Clients" value={stats?.totalClients ?? 0} trend={stats?.trendsThisWeek.clients} />
        <StatCard label="Scenario Runs" value={stats?.totalScenarioRuns ?? 0} trend={stats?.trendsThisWeek.scenarioRuns} />
        <StatCard label="PDF Exports" value={stats?.totalExports ?? 0} trend={stats?.trendsThisWeek.exports} />
      </div>

      {/* Activity Chart */}
      <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[11px] font-medium uppercase tracking-[1.5px] text-[rgba(255,255,255,0.25)]">
            Activity Over Time
          </h2>
          <div className="flex gap-2">
            <div className="flex gap-1 bg-[rgba(255,255,255,0.05)] rounded-lg p-1">
              {(['scenario_runs', 'exports', 'logins'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setActivityType(t)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    activityType === t
                      ? 'bg-[#d4af37] text-black font-medium'
                      : 'text-[rgba(255,255,255,0.5)] hover:text-white'
                  }`}
                >
                  {t === 'scenario_runs' ? 'Scenarios' : t === 'exports' ? 'Exports' : 'Logins'}
                </button>
              ))}
            </div>
            <div className="flex gap-1 bg-[rgba(255,255,255,0.05)] rounded-lg p-1">
              {(['7d', '30d', '90d'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setActivityRange(r)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    activityRange === r
                      ? 'bg-[rgba(255,255,255,0.15)] text-white font-medium'
                      : 'text-[rgba(255,255,255,0.5)] hover:text-white'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={activity}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="date"
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                tickFormatter={(v) => {
                  const d = new Date(v)
                  return `${d.getMonth() + 1}/${d.getDate()}`
                }}
                interval={activityRange === '7d' ? 0 : activityRange === '30d' ? 4 : 14}
              />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
                itemStyle={{ color: '#d4af37' }}
              />
              <Bar dataKey="count" fill="#d4af37" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Advisors Table */}
      <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[11px] font-medium uppercase tracking-[1.5px] text-[rgba(255,255,255,0.25)]">
            Advisors
          </h2>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Search email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="px-3 py-1.5 text-xs bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-lg text-white placeholder:text-[rgba(255,255,255,0.3)] outline-none focus:border-[#d4af37]"
            />
            <div className="flex gap-1 bg-[rgba(255,255,255,0.05)] rounded-lg p-1">
              {(['all', 'active', 'inactive'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors capitalize ${
                    statusFilter === s
                      ? 'bg-[rgba(255,255,255,0.15)] text-white font-medium'
                      : 'text-[rgba(255,255,255,0.5)] hover:text-white'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-[rgba(255,255,255,0.07)]">
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-[1px] text-[rgba(255,255,255,0.35)] font-medium">Email</th>
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-[1px] text-[rgba(255,255,255,0.35)] font-medium">Signup</th>
              <th className="text-right px-4 py-3 text-[10px] uppercase tracking-[1px] text-[rgba(255,255,255,0.35)] font-medium">Clients</th>
              <th className="text-right px-4 py-3 text-[10px] uppercase tracking-[1px] text-[rgba(255,255,255,0.35)] font-medium">Scenarios</th>
              <th className="text-right px-4 py-3 text-[10px] uppercase tracking-[1px] text-[rgba(255,255,255,0.35)] font-medium">Exports</th>
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-[1px] text-[rgba(255,255,255,0.35)] font-medium">Last Login</th>
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-[1px] text-[rgba(255,255,255,0.35)] font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(a => (
              <tr
                key={a.id}
                className="border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)] transition-colors cursor-pointer"
                onClick={() => window.location.href = `/admin/advisors/${a.id}`}
              >
                <td className="px-4 py-3 text-sm text-white">{a.email}</td>
                <td className="px-4 py-3 text-sm text-[rgba(255,255,255,0.5)]">
                  {new Date(a.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono text-[rgba(255,255,255,0.6)]">{a.clientCount}</td>
                <td className="px-4 py-3 text-sm text-right font-mono text-[rgba(255,255,255,0.6)]">{a.scenarioRunCount}</td>
                <td className="px-4 py-3 text-sm text-right font-mono text-[rgba(255,255,255,0.6)]">{a.exportCount}</td>
                <td className="px-4 py-3 text-sm text-[rgba(255,255,255,0.5)]">
                  {a.lastLogin ? new Date(a.lastLogin).toLocaleDateString() : 'Never'}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    a.status === 'active'
                      ? 'bg-[rgba(74,222,128,0.15)] text-[#4ade80]'
                      : 'bg-[rgba(255,255,255,0.08)] text-[rgba(255,255,255,0.4)]'
                  }`}>
                    {a.status}
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-[rgba(255,255,255,0.3)]">
                  No advisors found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatCard({ label, value, trend }: { label: string; value: number; trend?: number }) {
  return (
    <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-5">
      <p className="text-[10px] uppercase tracking-[1.5px] text-[rgba(255,255,255,0.25)] mb-2">{label}</p>
      <p className="text-2xl font-semibold text-white font-mono">{value.toLocaleString()}</p>
      {trend != null && trend > 0 && (
        <p className="text-xs text-[#4ade80] mt-1">+{trend} this week</p>
      )}
    </div>
  )
}
