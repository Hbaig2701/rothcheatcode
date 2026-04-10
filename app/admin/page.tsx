'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { ChevronUp, ChevronDown, Download, Calendar } from 'lucide-react'
import { BulkActionsBar } from './_components/bulk-actions-bar'
import { AnalyticsSection } from './_components/analytics-section'
import { CostsSection } from './_components/costs-section'
import { RevenueSection } from './_components/revenue-section'

interface Stats {
  totalPayingAdvisors: number
  newPayingAdvisors: number
  clients: number
  scenarioRuns: number
  exports: number
}

interface Advisor {
  id: string
  name: string | null
  email: string
  createdAt: string
  clientCount: number
  scenarioRunCount: number
  exportCount: number
  sessionCount: number
  lastLogin: string | null
  status: 'active' | 'inactive' | 'deactivated'
  subscriptionStatus: string
  billingCycle: string | null
}

interface ActivityPoint {
  date: string
  count: number
}

type SortKey = 'name' | 'email' | 'createdAt' | 'clientCount' | 'scenarioRunCount' | 'exportCount' | 'sessionCount' | 'lastLogin' | 'status' | 'subscriptionStatus'
type SortDir = 'asc' | 'desc'
type DateRange = 'today' | '7d' | '30d' | 'mtd' | 'all' | 'custom'

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: 'mtd', label: 'Month to Date' },
  { value: 'all', label: 'All Time' },
  { value: 'custom', label: 'Custom' },
]

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  scenario_runs: 'Scenarios',
  exports: 'PDF Exports',
  logins: 'Logins',
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [advisors, setAdvisors] = useState<Advisor[]>([])
  const [activity, setActivity] = useState<ActivityPoint[]>([])
  const [activityType, setActivityType] = useState<'scenario_runs' | 'exports' | 'logins'>('scenario_runs')
  const [activityRange, setActivityRange] = useState<'7d' | '30d' | '90d'>('30d')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'deactivated'>('all')
  const [showChurned, setShowChurned] = useState(false)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('createdAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  // Fetch stats with date range
  const fetchStats = useCallback(() => {
    let url = `/api/admin/stats?range=${dateRange}`
    if (dateRange === 'custom' && customFrom) {
      url += `&from=${customFrom}`
      if (customTo) url += `&to=${customTo}`
    }
    fetch(url).then(r => r.json()).then(s => setStats(s)).catch(console.error)
  }, [dateRange, customFrom, customTo])

  const fetchAdvisors = useCallback(() => {
    fetch(`/api/admin/advisors?churned=${showChurned}`).then(r => r.json()).then(a => setAdvisors(a.advisors ?? [])).catch(console.error)
  }, [showChurned])

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/stats?range=${dateRange}`).then(r => r.json()),
      fetch(`/api/admin/advisors?churned=${showChurned}`).then(r => r.json()),
    ]).then(([s, a]) => {
      setStats(s)
      setAdvisors(a.advisors ?? [])
      setLoading(false)
    }).catch(console.error)
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  useEffect(() => {
    fetchAdvisors()
  }, [showChurned])

  useEffect(() => {
    fetch(`/api/admin/activity?type=${activityType}&range=${activityRange}`)
      .then(r => r.json())
      .then(d => setActivity(d.data ?? []))
      .catch(console.error)
  }, [activityType, activityRange])

  const refetchAdvisors = useCallback(() => {
    fetchAdvisors()
    fetchStats()
  }, [fetchAdvisors, fetchStats])

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

  const filtered = useMemo(() => {
    let result = advisors.filter(a => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false
      if (!showChurned && a.subscriptionStatus === 'canceled') return false
      if (search) {
        const q = search.toLowerCase()
        if (!a.email.toLowerCase().includes(q) && !(a.name && a.name.toLowerCase().includes(q))) return false
      }
      return true
    })

    result.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'name': cmp = (a.name ?? '').localeCompare(b.name ?? ''); break
        case 'email': cmp = a.email.localeCompare(b.email); break
        case 'createdAt': cmp = a.createdAt.localeCompare(b.createdAt); break
        case 'clientCount': cmp = a.clientCount - b.clientCount; break
        case 'scenarioRunCount': cmp = a.scenarioRunCount - b.scenarioRunCount; break
        case 'exportCount': cmp = a.exportCount - b.exportCount; break
        case 'sessionCount': cmp = a.sessionCount - b.sessionCount; break
        case 'lastLogin': {
          const aVal = a.lastLogin ?? ''
          const bVal = b.lastLogin ?? ''
          cmp = aVal.localeCompare(bVal)
          break
        }
        case 'status': cmp = a.status.localeCompare(b.status); break
        case 'subscriptionStatus': cmp = a.subscriptionStatus.localeCompare(b.subscriptionStatus); break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [advisors, statusFilter, showChurned, search, sortKey, sortDir])

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(a => a.id)))
    }
  }, [filtered, selectedIds.size])

  const exportToCSV = useCallback(() => {
    const headers = ['Email', 'Name', 'Status', 'Subscription', 'Billing', 'Signup Date', 'Clients', 'Scenarios', 'Exports', 'Sessions', 'Last Login']
    const rows = filtered.map(a => [
      a.email,
      a.name ?? '',
      a.status,
      a.subscriptionStatus,
      a.billingCycle ?? '',
      new Date(a.createdAt).toLocaleDateString(),
      a.clientCount,
      a.scenarioRunCount,
      a.exportCount,
      a.sessionCount,
      a.lastLogin ? new Date(a.lastLogin).toLocaleDateString() : 'Never'
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `advisors-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }, [filtered])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-text-dim">Loading dashboard...</div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Date Range Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <Calendar className="h-4 w-4 text-text-muted" />
        <div className="flex gap-1 bg-bg-card border border-border-default rounded-lg p-1">
          {DATE_RANGE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setDateRange(opt.value)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                dateRange === opt.value
                  ? 'bg-[#d4af37] text-black font-medium'
                  : 'text-text-muted hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {dateRange === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="px-2 py-1 text-xs bg-bg-card border border-border-default rounded-lg text-foreground outline-none focus:border-[#d4af37]"
            />
            <span className="text-xs text-text-muted">to</span>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="px-2 py-1 text-xs bg-bg-card border border-border-default rounded-lg text-foreground outline-none focus:border-[#d4af37]"
            />
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Paying Advisors" value={stats?.totalPayingAdvisors ?? 0} subtitle={dateRange !== 'all' ? `+${stats?.newPayingAdvisors ?? 0} in period` : undefined} />
        <StatCard label="Clients Created" value={stats?.clients ?? 0} />
        <StatCard label="Scenario Runs" value={stats?.scenarioRuns ?? 0} />
        <StatCard label="PDF Exports" value={stats?.exports ?? 0} />
        <StatCard label="New Signups" value={stats?.newPayingAdvisors ?? 0} subtitle="in selected period" />
      </div>

      {/* Revenue Section */}
      <RevenueSection />

      {/* Activity Chart */}
      <div className="bg-bg-card border border-border-default rounded-[14px] p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-[1.5px] text-text-muted">
            Activity Over Time
          </h2>
          <div className="flex gap-2">
            <div className="flex gap-1 bg-bg-card-hover rounded-lg p-1">
              {(['scenario_runs', 'exports', 'logins'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setActivityType(t)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    activityType === t
                      ? 'bg-[#d4af37] text-black font-medium'
                      : 'text-text-muted hover:text-foreground'
                  }`}
                >
                  {ACTIVITY_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
            <div className="flex gap-1 bg-bg-card-hover rounded-lg p-1">
              {(['7d', '30d', '90d'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setActivityRange(r)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    activityRange === r
                      ? 'bg-[rgba(255,255,255,0.15)] text-foreground font-medium'
                      : 'text-text-muted hover:text-foreground'
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
                label={{ value: 'Date', position: 'insideBottom', offset: -5, style: { fill: 'rgba(255,255,255,0.4)', fontSize: 11 } }}
              />
              <YAxis
                tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                allowDecimals={false}
                label={{ value: 'Count', angle: -90, position: 'insideLeft', offset: 10, style: { fill: 'rgba(255,255,255,0.4)', fontSize: 11 } }}
              />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
                labelFormatter={(label) => {
                  const d = new Date(label)
                  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                }}
                formatter={(value: number | undefined) => [value ?? 0, ACTIVITY_TYPE_LABELS[activityType]]}
              />
              <Bar dataKey="count" fill="#d4af37" radius={[3, 3, 0, 0]} name={ACTIVITY_TYPE_LABELS[activityType]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Analytics */}
      <AnalyticsSection />

      {/* Usage & Costs */}
      <CostsSection />

      {/* Advisors Table */}
      <div className="bg-bg-card border border-border-default rounded-[14px] p-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[1.5px] text-text-muted">
            Paying Advisors
          </h2>
          <div className="flex gap-3 flex-wrap">
            <input
              type="text"
              placeholder="Search name or email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="px-3 py-1.5 text-xs bg-bg-card-hover border border-border-default rounded-lg text-foreground placeholder:text-text-muted outline-none focus:border-[#d4af37]"
            />
            <div className="flex gap-1 bg-bg-card-hover rounded-lg p-1">
              {(['all', 'active', 'inactive', 'deactivated'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors capitalize ${
                    statusFilter === s
                      ? 'bg-[rgba(255,255,255,0.15)] text-foreground font-medium'
                      : 'text-text-muted hover:text-foreground'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowChurned(!showChurned)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                showChurned
                  ? 'bg-[rgba(239,68,68,0.15)] border-[rgba(239,68,68,0.3)] text-[#ef4444]'
                  : 'bg-bg-card-hover border-border-default text-text-muted hover:text-foreground'
              }`}
            >
              {showChurned ? 'Showing Churned' : 'Show Churned'}
            </button>
            <button
              onClick={exportToCSV}
              className="px-3 py-1.5 text-xs bg-bg-card-hover border border-border-default rounded-lg text-foreground hover:bg-secondary transition-colors flex items-center gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
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
            <tr className="border-b border-border-default">
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && selectedIds.size === filtered.length}
                  onChange={toggleSelectAll}
                  className="rounded border-border bg-transparent accent-[#d4af37]"
                />
              </th>
              <SortableHeader label="Name" sortKey="name" align="left" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Email" sortKey="email" align="left" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Subscription" sortKey="subscriptionStatus" align="left" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Signup" sortKey="createdAt" align="left" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Clients" sortKey="clientCount" align="right" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Scenarios" sortKey="scenarioRunCount" align="right" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Exports" sortKey="exportCount" align="right" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Sessions" sortKey="sessionCount" align="right" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Last Session" sortKey="lastLogin" align="left" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Status" sortKey="status" align="left" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3 text-xs uppercase tracking-[1px] font-semibold text-text-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(a => (
              <tr
                key={a.id}
                className={`border-b border-bg-card hover:bg-bg-card transition-colors cursor-pointer ${
                  selectedIds.has(a.id) ? 'bg-[rgba(212,175,55,0.05)]' : ''
                }`}
                onClick={() => window.location.href = `/admin/advisors/${a.id}`}
              >
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(a.id)}
                    onChange={() => toggleSelect(a.id)}
                    className="rounded border-border bg-transparent accent-[#d4af37]"
                  />
                </td>
                <td className="px-4 py-3 text-sm text-foreground">{a.name ?? <span className="text-text-dimmer">—</span>}</td>
                <td className="px-4 py-3 text-sm text-foreground">{a.email}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    a.subscriptionStatus === 'active'
                      ? 'bg-[rgba(74,222,128,0.15)] text-green'
                      : a.subscriptionStatus === 'canceled'
                        ? 'bg-[rgba(239,68,68,0.15)] text-[#ef4444]'
                        : a.subscriptionStatus === 'past_due'
                          ? 'bg-[rgba(245,158,11,0.15)] text-[#f59e0b]'
                          : 'bg-secondary text-text-dim'
                  }`}>
                    {a.subscriptionStatus}{a.billingCycle ? ` (${a.billingCycle})` : ''}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-text-muted">
                  {new Date(a.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono text-text-dim">{a.clientCount}</td>
                <td className="px-4 py-3 text-sm text-right font-mono text-text-dim">{a.scenarioRunCount}</td>
                <td className="px-4 py-3 text-sm text-right font-mono text-text-dim">{a.exportCount}</td>
                <td className="px-4 py-3 text-sm text-right font-mono text-text-dim">{a.sessionCount}</td>
                <td className="px-4 py-3 text-sm text-text-muted">
                  {a.lastLogin ? new Date(a.lastLogin).toLocaleDateString() : 'Never'}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    a.status === 'deactivated'
                      ? 'bg-[rgba(239,68,68,0.15)] text-[#ef4444]'
                      : a.status === 'active'
                        ? 'bg-[rgba(74,222,128,0.15)] text-green'
                        : 'bg-secondary text-text-dim'
                  }`}>
                    {a.status}
                  </span>
                </td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <Link
                    href={`/admin/advisors/${a.id}`}
                    className="text-xs px-2 py-1 rounded-md bg-[rgba(59,130,246,0.15)] text-[#3b82f6] hover:bg-[rgba(59,130,246,0.25)] transition-colors inline-flex items-center gap-1"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-sm text-text-muted">
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
        isActive ? 'text-primary' : 'text-text-muted hover:text-foreground/80'
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

function StatCard({ label, value, subtitle }: { label: string; value: number; subtitle?: string }) {
  return (
    <div className="bg-bg-card border border-border-default rounded-[14px] p-5">
      <p className="text-xs uppercase tracking-[1.5px] text-text-muted font-semibold mb-2">{label}</p>
      <p className="text-2xl font-semibold text-foreground font-mono">{value.toLocaleString()}</p>
      {subtitle && (
        <p className="text-xs text-text-dim mt-1">{subtitle}</p>
      )}
    </div>
  )
}
