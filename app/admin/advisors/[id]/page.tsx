'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface AdvisorDetail {
  advisor: {
    id: string
    email: string
    createdAt: string
    status: 'active' | 'inactive'
    stats: {
      clientCount: number
      scenarioRunCount: number
      exportCount: number
      totalLogins: number
      avgLoginsPerWeek: number
      daysSinceSignup: number
      daysSinceLastActivity: number
    }
  }
  clients: {
    id: string
    name: string
    createdAt: string
    lastActivity: string
    scenarioRuns: number
    exports: number
  }[]
  recentActivity: {
    type: string
    clientName: string | null
    timestamp: string
  }[]
}

export default function AdvisorDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [data, setData] = useState<AdvisorDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/admin/advisors/${id}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(console.error)
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-[rgba(255,255,255,0.4)]">Loading advisor...</div>
      </div>
    )
  }

  if (!data?.advisor) {
    return (
      <div className="text-center py-20">
        <p className="text-[rgba(255,255,255,0.4)]">Advisor not found</p>
        <Link href="/admin" className="text-[#d4af37] text-sm mt-2 inline-block">Back to Dashboard</Link>
      </div>
    )
  }

  const { advisor, clients, recentActivity } = data

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/admin" className="text-xs text-[rgba(255,255,255,0.4)] hover:text-white transition-colors mb-2 inline-block">
            &larr; Back to Dashboard
          </Link>
          <h2 className="text-xl font-semibold text-white">{advisor.email}</h2>
          <p className="text-sm text-[rgba(255,255,255,0.4)] mt-1">
            Signed up {new Date(advisor.createdAt).toLocaleDateString()}
          </p>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full font-medium ${
          advisor.status === 'active'
            ? 'bg-[rgba(74,222,128,0.15)] text-[#4ade80]'
            : 'bg-[rgba(255,255,255,0.08)] text-[rgba(255,255,255,0.4)]'
        }`}>
          {advisor.status}
        </span>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MiniStat label="Clients" value={advisor.stats.clientCount} />
        <MiniStat label="Scenarios" value={advisor.stats.scenarioRunCount} />
        <MiniStat label="Exports" value={advisor.stats.exportCount} />
        <MiniStat label="Logins" value={advisor.stats.totalLogins} />
        <MiniStat label="Logins/Week" value={advisor.stats.avgLoginsPerWeek} />
        <MiniStat label="Days Since Active" value={advisor.stats.daysSinceLastActivity} />
      </div>

      {/* Client List */}
      <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-6">
        <h3 className="text-[11px] font-medium uppercase tracking-[1.5px] text-[rgba(255,255,255,0.25)] mb-4">
          Clients ({clients.length})
        </h3>
        {clients.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.07)]">
                <th className="text-left px-4 py-2 text-[10px] uppercase tracking-[1px] text-[rgba(255,255,255,0.35)] font-medium">Name</th>
                <th className="text-left px-4 py-2 text-[10px] uppercase tracking-[1px] text-[rgba(255,255,255,0.35)] font-medium">Created</th>
                <th className="text-left px-4 py-2 text-[10px] uppercase tracking-[1px] text-[rgba(255,255,255,0.35)] font-medium">Last Activity</th>
                <th className="text-right px-4 py-2 text-[10px] uppercase tracking-[1px] text-[rgba(255,255,255,0.35)] font-medium">Scenarios</th>
                <th className="text-right px-4 py-2 text-[10px] uppercase tracking-[1px] text-[rgba(255,255,255,0.35)] font-medium">Exports</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(c => (
                <tr key={c.id} className="border-b border-[rgba(255,255,255,0.03)]">
                  <td className="px-4 py-3 text-sm text-white">{c.name}</td>
                  <td className="px-4 py-3 text-sm text-[rgba(255,255,255,0.5)]">{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-sm text-[rgba(255,255,255,0.5)]">{new Date(c.lastActivity).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-[rgba(255,255,255,0.6)]">{c.scenarioRuns}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-[rgba(255,255,255,0.6)]">{c.exports}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-[rgba(255,255,255,0.3)] text-center py-4">No clients yet</p>
        )}
      </div>

      {/* Recent Activity */}
      <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-6">
        <h3 className="text-[11px] font-medium uppercase tracking-[1.5px] text-[rgba(255,255,255,0.25)] mb-4">
          Recent Activity
        </h3>
        {recentActivity.length > 0 ? (
          <div className="space-y-2">
            {recentActivity.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between py-2 border-b border-[rgba(255,255,255,0.03)] last:border-0">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${
                    item.type === 'login' ? 'bg-blue-400' :
                    item.type === 'scenario_run' ? 'bg-[#d4af37]' :
                    'bg-[#4ade80]'
                  }`} />
                  <span className="text-sm text-[rgba(255,255,255,0.7)]">
                    {item.type === 'login' && 'Logged in'}
                    {item.type === 'scenario_run' && `Ran scenario${item.clientName ? ` for ${item.clientName}` : ''}`}
                    {item.type === 'export' && `Exported PDF${item.clientName ? ` for ${item.clientName}` : ''}`}
                  </span>
                </div>
                <span className="text-xs text-[rgba(255,255,255,0.3)]">
                  {formatTimeAgo(item.timestamp)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[rgba(255,255,255,0.3)] text-center py-4">No activity yet</p>
        )}
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-lg p-3">
      <p className="text-[9px] uppercase tracking-[1px] text-[rgba(255,255,255,0.25)] mb-1">{label}</p>
      <p className="text-lg font-semibold text-white font-mono">{value}</p>
    </div>
  )
}

function formatTimeAgo(timestamp: string): string {
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}
