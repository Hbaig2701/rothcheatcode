import { cn } from '@/lib/utils'
import {
  STATUS_LABELS,
  SEVERITY_LABELS,
  PRIORITY_LABELS,
  type SupportStatus,
  type SupportSeverity,
  type SupportPriority,
} from '@/lib/types/support'

const statusStyle: Record<SupportStatus, string> = {
  open: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  in_progress: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  waiting_on_user: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  resolved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  closed: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
}

const severityStyle: Record<SupportSeverity, string> = {
  low: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  medium: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  high: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  critical: 'bg-red-500/15 text-red-400 border-red-500/30',
}

const priorityStyle: Record<SupportPriority, string> = {
  low: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  medium: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  high: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  urgent: 'bg-red-500/15 text-red-400 border-red-500/30',
}

const baseClass = 'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap'

export function StatusBadge({ status, className }: { status: SupportStatus; className?: string }) {
  return <span className={cn(baseClass, statusStyle[status], className)}>{STATUS_LABELS[status]}</span>
}

export function SeverityBadge({ severity, className }: { severity: SupportSeverity; className?: string }) {
  return <span className={cn(baseClass, severityStyle[severity], className)}>{SEVERITY_LABELS[severity]}</span>
}

export function PriorityBadge({ priority, className }: { priority: SupportPriority; className?: string }) {
  return <span className={cn(baseClass, priorityStyle[priority], className)}>{PRIORITY_LABELS[priority]}</span>
}
