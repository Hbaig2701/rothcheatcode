'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface AdvisorDetail {
  advisor: {
    id: string
    email: string
    createdAt: string
    isActive: boolean
    deactivatedAt: string | null
    status: 'active' | 'inactive' | 'deactivated'
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
  const [actionLoading, setActionLoading] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'deactivate' | 'delete' | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const fetchAdvisor = () => {
    fetch(`/api/admin/advisors/${id}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(console.error)
  }

  useEffect(() => { fetchAdvisor() }, [id])

  const handleAction = async (action: string) => {
    setActionLoading(true)
    setFeedback(null)
    try {
      const res = await fetch(`/api/admin/advisors/${id}/manage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Action failed')
      setFeedback({ type: 'success', message: result.message })
      setConfirmAction(null)
      if (action === 'delete') {
        setTimeout(() => window.location.href = '/admin', 1500)
      } else {
        fetchAdvisor()
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Action failed' })
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-text-dim">Loading advisor...</div>
      </div>
    )
  }

  if (!data?.advisor) {
    return (
      <div className="text-center py-20">
        <p className="text-text-dim">Advisor not found</p>
        <Link href="/admin" className="text-primary text-sm mt-2 inline-block">Back to Dashboard</Link>
      </div>
    )
  }

  const { advisor, clients, recentActivity } = data

  return (
    <div className="space-y-8">
      {/* Feedback Toast */}
      {feedback && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium ${
          feedback.type === 'success'
            ? 'bg-[rgba(74,222,128,0.15)] text-green border border-green/20'
            : 'bg-[rgba(239,68,68,0.15)] text-[#ef4444] border border-[rgba(239,68,68,0.2)]'
        }`}>
          {feedback.message}
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-surface-elevated border border-border-default rounded-xl p-6 max-w-md w-full mx-4 space-y-4">
            <h3 className="text-lg font-semibold text-foreground">
              {confirmAction === 'delete' ? 'Permanently Delete User?' : 'Deactivate User?'}
            </h3>
            <p className="text-sm text-text-muted">
              {confirmAction === 'delete'
                ? `This will permanently delete ${advisor.email} and all their data (clients, projections, exports, logs). This action cannot be undone.`
                : `This will temporarily block ${advisor.email} from logging in. You can reactivate their account later.`}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmAction(null)}
                disabled={actionLoading}
                className="px-4 py-2 text-sm rounded-lg bg-secondary text-foreground hover:bg-[rgba(255,255,255,0.12)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleAction(confirmAction)}
                disabled={actionLoading}
                className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
                  confirmAction === 'delete'
                    ? 'bg-[#ef4444] text-white hover:bg-[#dc2626]'
                    : 'bg-[#f59e0b] text-black hover:bg-[#d97706]'
                }`}
              >
                {actionLoading ? 'Processing...' : (confirmAction === 'delete' ? 'Delete Permanently' : 'Deactivate')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/admin" className="text-xs text-text-dim hover:text-foreground transition-colors mb-2 inline-block">
            &larr; Back to Dashboard
          </Link>
          <h2 className="text-xl font-semibold text-foreground">{advisor.email}</h2>
          <p className="text-sm text-text-dim mt-1">
            Signed up {new Date(advisor.createdAt).toLocaleDateString()}
          </p>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full font-medium ${
          advisor.status === 'deactivated'
            ? 'bg-[rgba(239,68,68,0.15)] text-[#ef4444]'
            : advisor.status === 'active'
              ? 'bg-[rgba(74,222,128,0.15)] text-green'
              : 'bg-secondary text-text-dim'
        }`}>
          {advisor.status}
        </span>
      </div>

      {/* Admin Actions */}
      <div className="bg-bg-card border border-border-default rounded-[14px] p-6">
        <h3 className="text-xs font-medium uppercase tracking-[1.5px] text-text-dim mb-4">
          Admin Actions
        </h3>
        <div className="flex flex-wrap gap-3">
          {advisor.isActive ? (
            <button
              onClick={() => setConfirmAction('deactivate')}
              disabled={actionLoading}
              className="px-4 py-2 text-sm rounded-lg bg-[rgba(245,158,11,0.15)] text-[#f59e0b] border border-[rgba(245,158,11,0.2)] hover:bg-[rgba(245,158,11,0.25)] transition-colors font-medium"
            >
              Deactivate Account
            </button>
          ) : (
            <button
              onClick={() => handleAction('reactivate')}
              disabled={actionLoading}
              className="px-4 py-2 text-sm rounded-lg bg-[rgba(74,222,128,0.15)] text-green border border-green/20 hover:bg-[rgba(74,222,128,0.25)] transition-colors font-medium"
            >
              {actionLoading ? 'Processing...' : 'Reactivate Account'}
            </button>
          )}
          <button
            onClick={() => handleAction('reset_password')}
            disabled={actionLoading}
            className="px-4 py-2 text-sm rounded-lg bg-[rgba(59,130,246,0.15)] text-[#3b82f6] border border-[rgba(59,130,246,0.2)] hover:bg-[rgba(59,130,246,0.25)] transition-colors font-medium"
          >
            {actionLoading ? 'Processing...' : 'Send Password Reset'}
          </button>
          <button
            onClick={() => setConfirmAction('delete')}
            disabled={actionLoading}
            className="px-4 py-2 text-sm rounded-lg bg-[rgba(239,68,68,0.15)] text-[#ef4444] border border-[rgba(239,68,68,0.2)] hover:bg-[rgba(239,68,68,0.25)] transition-colors font-medium"
          >
            Delete User
          </button>
        </div>
        {advisor.deactivatedAt && (
          <p className="text-xs text-text-muted mt-3">
            Deactivated on {new Date(advisor.deactivatedAt).toLocaleDateString()}
          </p>
        )}
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
      <div className="bg-bg-card border border-border-default rounded-[14px] p-6">
        <h3 className="text-xs font-medium uppercase tracking-[1.5px] text-text-dim mb-4">
          Clients ({clients.length})
        </h3>
        {clients.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-default">
                <th className="text-left px-4 py-2 text-xs uppercase tracking-[1px] text-text-dim font-medium">Name</th>
                <th className="text-left px-4 py-2 text-xs uppercase tracking-[1px] text-text-dim font-medium">Created</th>
                <th className="text-left px-4 py-2 text-xs uppercase tracking-[1px] text-text-dim font-medium">Last Activity</th>
                <th className="text-right px-4 py-2 text-xs uppercase tracking-[1px] text-text-dim font-medium">Scenarios</th>
                <th className="text-right px-4 py-2 text-xs uppercase tracking-[1px] text-text-dim font-medium">Exports</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(c => (
                <tr key={c.id} className="border-b border-bg-card">
                  <td className="px-4 py-3 text-sm text-foreground">{c.name}</td>
                  <td className="px-4 py-3 text-sm text-text-muted">{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-sm text-text-muted">{new Date(c.lastActivity).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-text-dim">{c.scenarioRuns}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-text-dim">{c.exports}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-text-muted text-center py-4">No clients yet</p>
        )}
      </div>

      {/* Recent Activity */}
      <div className="bg-bg-card border border-border-default rounded-[14px] p-6">
        <h3 className="text-xs font-medium uppercase tracking-[1.5px] text-text-dim mb-4">
          Recent Activity
        </h3>
        {recentActivity.length > 0 ? (
          <div className="space-y-2">
            {recentActivity.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between py-2 border-b border-bg-card last:border-0">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${
                    item.type === 'login' ? 'bg-blue-400' :
                    item.type === 'scenario_run' ? 'bg-[#d4af37]' :
                    'bg-[#4ade80]'
                  }`} />
                  <span className="text-sm text-text-muted">
                    {item.type === 'login' && 'Logged in'}
                    {item.type === 'scenario_run' && `Ran scenario${item.clientName ? ` for ${item.clientName}` : ''}`}
                    {item.type === 'export' && `Exported PDF${item.clientName ? ` for ${item.clientName}` : ''}`}
                  </span>
                </div>
                <span className="text-xs text-text-muted">
                  {formatTimeAgo(item.timestamp)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-muted text-center py-4">No activity yet</p>
        )}
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-bg-card border border-border-default rounded-lg p-3">
      <p className="text-[9px] uppercase tracking-[1px] text-text-dim mb-1">{label}</p>
      <p className="text-lg font-semibold text-foreground font-mono">{value}</p>
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
