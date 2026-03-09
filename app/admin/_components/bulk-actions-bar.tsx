'use client'

import { useState } from 'react'
import { Trash2, UserX, X } from 'lucide-react'

interface BulkActionsBarProps {
  selectedIds: Set<string>
  advisorEmails: Map<string, string>
  onClear: () => void
  onBulkAction: (action: 'delete' | 'deactivate') => Promise<void>
  loading: boolean
}

export function BulkActionsBar({ selectedIds, advisorEmails, onClear, onBulkAction, loading }: BulkActionsBarProps) {
  const [confirmAction, setConfirmAction] = useState<'delete' | 'deactivate' | null>(null)
  const count = selectedIds.size

  if (count === 0) return null

  return (
    <>
      <div className="flex items-center gap-3 bg-[rgba(212,175,55,0.08)] border border-[rgba(212,175,55,0.2)] rounded-xl px-4 py-3 mb-4">
        <span className="text-sm font-medium text-[#d4af37]">
          {count} selected
        </span>
        <div className="flex-1" />
        <button
          onClick={() => setConfirmAction('deactivate')}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[rgba(245,158,11,0.15)] text-[#f59e0b] hover:bg-[rgba(245,158,11,0.25)] transition-colors disabled:opacity-50"
        >
          <UserX className="h-3.5 w-3.5" />
          Deactivate
        </button>
        <button
          onClick={() => setConfirmAction('delete')}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[rgba(239,68,68,0.15)] text-[#ef4444] hover:bg-[rgba(239,68,68,0.25)] transition-colors disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
        <button
          onClick={onClear}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg text-[rgba(255,255,255,0.5)] hover:text-white transition-colors disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </button>
      </div>

      {/* Confirmation Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-2">
              {confirmAction === 'delete' ? 'Delete' : 'Deactivate'} {count} Advisor{count > 1 ? 's' : ''}?
            </h3>
            <p className="text-sm text-[rgba(255,255,255,0.5)] mb-4">
              {confirmAction === 'delete'
                ? 'This will permanently delete all data for these advisors including their clients, scenarios, and exports. This cannot be undone.'
                : 'These advisors will no longer be able to access the platform. You can reactivate them later.'}
            </p>
            <div className="max-h-40 overflow-y-auto mb-4 bg-[rgba(255,255,255,0.03)] rounded-lg p-3 space-y-1">
              {Array.from(selectedIds).map(id => (
                <p key={id} className="text-xs text-[rgba(255,255,255,0.6)] font-mono">
                  {advisorEmails.get(id) ?? id}
                </p>
              ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmAction(null)}
                disabled={loading}
                className="px-4 py-2 text-sm rounded-lg text-[rgba(255,255,255,0.6)] hover:text-white transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await onBulkAction(confirmAction)
                  setConfirmAction(null)
                }}
                disabled={loading}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
                  confirmAction === 'delete'
                    ? 'bg-[#ef4444] hover:bg-[#dc2626] text-white'
                    : 'bg-[#f59e0b] hover:bg-[#d97706] text-black'
                }`}
              >
                {loading
                  ? 'Processing...'
                  : `${confirmAction === 'delete' ? 'Delete' : 'Deactivate'} ${count} Advisor${count > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
