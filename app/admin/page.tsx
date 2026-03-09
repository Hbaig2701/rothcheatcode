'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { BulkActionsBar } from './_components/bulk-actions-bar'
import { AnalyticsSection } from './_components/analytics-section'
import { CostsSection } from './_components/costs-section'

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
  status: 'active' | 'inactive' | 'deactivated'
}

interface ActivityPoint {
  date: string
  count: number
}

type SortKey = 'email' | 'createdAt' | 'clientCount' | 'scenarioRunCount' | 'exportCount' | 'lastLogin' | 'status'
type SortDir = 'asc' | 'desc'
type TimeFilter = 'all' | '1d' | '7d' | '30d'

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [advisors, setAdvisors] = useState<Advisor[]>([])
  const [activity, setActivity] = useState<ActivityPoint[]>([])
  const [activityType, setActivityType] = useState<'scenario_runs' | 'exports' | 'logins'>('scenario_runs')
  const [activityRange, setActivityRange] = useState<'7d' | '30d' | '90d'>('30d')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'deactivated'>('all')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('createdAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)

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

  const refetchAdvisors = useCallback(() => {
    fetch('/api/admin/advisors').then(r => r.json()).then(a => setAdvisors(a.advisors ?? [])).catch(console.error)
    fetch('/api/admin/stats').then(r => r.json()).then(s => setStats(s)).catch(console.error)
  }, [])

  const advisorEmails = useMemo(() => {
    const map = new Map<string, string>()
    advisors.forEach(a => map.set(a.id, a.email))
    return map
  }, [advisors])

  const handleBulkAction = useCallback(async (action: 'delete' | 'deactivate') => {
    setBulkLoading(true)
    try {
      const res = await fetch('/api/admin/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, advisorIds: Array.from(selectedIds) }),
      })
      const data = await res.json()
      if (data.success) {
        setSelectedIds(new Set())
        refetchAdvisors()
      }
    } catch (err) {
      console.error('Bulk action failed:', err)
    } finally {
      setBulkLoading(false)
    }
  }, [selectedIds, refetchAdvisors])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  // Filter and sort advisors client-side
  const filtered = useMemo(() => {
    let result = advisors.filter(a => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false
      if (search && !a.email.toLowerCase().includes(search.toLowerCase())) return false
      if (timeFilter !== 'all') {
        const now = Date.now()
        const ms = timeFilter === '1d' ? 86400000 : timeFilter === '7d' ? 604800000 : 2592000000
        const cutoff = new Date(now - ms).toISOString()
        const signupDate = a.createdAt
        if (signupDate < cutoff) return false
      }
      return true
    })

    result.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'email': cmp = a.email.localeCompare(b.email); break
        case 'createdAt': cmp = a.createdAt.localeCompare(b.createdAt); break
        case 'clientCount': cmp = a.clientCount - b.clientCount; break
        case 'scenarioRunCount': cmp = a.scenarioRunCount - b.scenarioRunCount; break
        case 'exportCount': cmp = a.exportCount - b.exportCount; break
        case 'lastLogin': {
          const aVal = a.lastLogin ?? ''
          const bVal = b.lastLogin ?? ''
          cmp = aVal.localeCompare(bVal)
          break
        }
        case 'status': cmp = a.status.localeCompare(b.status); break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [advisors, statusFilter, search, timeFilter, sortKey, sortDir])

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(a => a.id)))
    }
  }, [filtered, selectedIds.size])

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
          <h2 className="text-sm font-semibold uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)]">
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
                tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                tickFormatter={(v) => {
                  const d = new Date(v)
                  return `${d.getMonth() + 1}/${d.getDate()}`
                }}
                interval={activityRange === '7d' ? 0 : activityRange === '30d' ? 4 : 14}
              />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }} allowDecimals={false} />
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

      {/* Analytics */}
      <AnalyticsSection />

      {/* Usage & Costs */}
      <CostsSection />

      {/* Advisors Table */}
      <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)]">
            Advisors
          </h2>
          <div className="flex gap-3 flex-wrap">
            <input
              type="text"
              placeholder="Search email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="px-3 py-1.5 text-xs bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-lg text-white placeholder:text-[rgba(255,255,255,0.3)] outline-none focus:border-[#d4af37]"
            />
            <div className="flex gap-1 bg-[rgba(255,255,255,0.05)] rounded-lg p-1">
              {([['all', 'All'], ['1d', '1 Day'], ['7d', '7 Days'], ['30d', '30 Days']] as const).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setTimeFilter(value as TimeFilter)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    timeFilter === value
                      ? 'bg-[#d4af37] text-black font-medium'
                      : 'text-[rgba(255,255,255,0.5)] hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-1 bg-[rgba(255,255,255,0.05)] rounded-lg p-1">
              {(['all', 'active', 'inactive', 'deactivated'] as const).map(s => (
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

        <BulkActionsBar
          selectedIds={selectedIds}
          advisorEmails={advisorEmails}
          onClear={() => setSelectedIds(new Set())}
          onBulkAction={handleBulkAction}
          loading={bulkLoading}
        />

        <table className="w-full">
          <thead>
            <tr className="border-b border-[rgba(255,255,255,0.07)]">
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && selectedIds.size === filtered.length}
                  onChange={toggleSelectAll}
                  className="rounded border-[rgba(255,255,255,0.2)] bg-transparent accent-[#d4af37]"
                />
              </th>
              <SortableHeader label="Email" sortKey="email" align="left" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Signup" sortKey="createdAt" align="left" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Clients" sortKey="clientCount" align="right" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Scenarios" sortKey="scenarioRunCount" align="right" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Exports" sortKey="exportCount" align="right" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Last Login" sortKey="lastLogin" align="left" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Status" sortKey="status" align="left" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {filtered.map(a => (
              <tr
                key={a.id}
                className={`border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)] transition-colors cursor-pointer ${
                  selectedIds.has(a.id) ? 'bg-[rgba(212,175,55,0.05)]' : ''
                }`}
                onClick={() => window.location.href = `/admin/advisors/${a.id}`}
              >
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(a.id)}
                    onChange={() => toggleSelect(a.id)}
                    className="rounded border-[rgba(255,255,255,0.2)] bg-transparent accent-[#d4af37]"
                  />
                </td>
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
                    a.status === 'deactivated'
                      ? 'bg-[rgba(239,68,68,0.15)] text-[#ef4444]'
                      : a.status === 'active'
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
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-[rgba(255,255,255,0.3)]">
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

function SortableHeader({ label, sortKey: key, align, currentSort, currentDir, onSort }: {
  label: string
  sortKey: SortKey
  align: 'left' | 'right'
  currentSort: SortKey
  currentDir: SortDir
  onSort: (key: SortKey) => void
}) {
  const isActive = currentSort === key
  return (
    <th
      className={`${align === 'right' ? 'text-right' : 'text-left'} px-4 py-3 text-xs uppercase tracking-[1px] font-semibold cursor-pointer select-none transition-colors ${
        isActive ? 'text-[#d4af37]' : 'text-[rgba(255,255,255,0.5)] hover:text-[rgba(255,255,255,0.8)]'
      }`}
      onClick={() => onSort(key)}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        {label}
        {isActive && (
          currentDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        )}
      </span>
    </th>
  )
}

function StatCard({ label, value, trend }: { label: string; value: number; trend?: number }) {
  return (
    <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-5">
      <p className="text-xs uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)] font-semibold mb-2">{label}</p>
      <p className="text-2xl font-semibold text-white font-mono">{value.toLocaleString()}</p>
      {trend != null && trend > 0 && (
        <p className="text-xs text-[#4ade80] mt-1">+{trend} this week</p>
      )}
    </div>
  )
}
