'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  SUPPORT_STATUSES,
  SUPPORT_SEVERITIES,
  SUPPORT_PRIORITIES,
  STATUS_LABELS,
  SEVERITY_LABELS,
  PRIORITY_LABELS,
} from '@/lib/types/support'

interface AdminFilterBarProps {
  advisors: { id: string; name: string }[]
  admins: { id: string; name: string }[]
}

export function AdminFilterBar({ advisors, admins }: AdminFilterBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setParam = useCallback((key: string, value: string) => {
    const p = new URLSearchParams(searchParams.toString())
    if (!value || value === 'all') p.delete(key)
    else p.set(key, value)
    router.push(`${pathname}?${p.toString()}`, { scroll: false })
  }, [router, pathname, searchParams])

  const get = (k: string) => searchParams.get(k) ?? 'all'
  const search = searchParams.get('q') ?? ''

  const hasFilters = ['status', 'severity', 'priority', 'advisor', 'assignee', 'q'].some((k) => searchParams.has(k))

  function selectClass() {
    return 'h-9 rounded-md border border-border bg-white dark:bg-input/30 px-2.5 text-sm shadow-xs'
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[220px]">
        <Search className="absolute left-2.5 top-2.5 size-4 text-text-dim" />
        <Input
          value={search}
          onChange={(e) => setParam('q', e.target.value)}
          placeholder="Search subject…"
          className="pl-9"
        />
      </div>
      <select value={get('status')} onChange={(e) => setParam('status', e.target.value)} className={selectClass()}>
        <option value="all">All status</option>
        {SUPPORT_STATUSES.map((s) => (<option key={s} value={s}>{STATUS_LABELS[s]}</option>))}
      </select>
      <select value={get('severity')} onChange={(e) => setParam('severity', e.target.value)} className={selectClass()}>
        <option value="all">All severity</option>
        {SUPPORT_SEVERITIES.map((s) => (<option key={s} value={s}>{SEVERITY_LABELS[s]}</option>))}
      </select>
      <select value={get('priority')} onChange={(e) => setParam('priority', e.target.value)} className={selectClass()}>
        <option value="all">All priority</option>
        {SUPPORT_PRIORITIES.map((p) => (<option key={p} value={p}>{PRIORITY_LABELS[p]}</option>))}
      </select>
      <select value={get('advisor')} onChange={(e) => setParam('advisor', e.target.value)} className={selectClass()}>
        <option value="all">All advisors</option>
        {advisors.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
      </select>
      <select value={get('assignee')} onChange={(e) => setParam('assignee', e.target.value)} className={selectClass()}>
        <option value="all">Any assignee</option>
        <option value="unassigned">Unassigned</option>
        {admins.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
      </select>
      {hasFilters && (
        <button
          type="button"
          onClick={() => router.push(pathname, { scroll: false })}
          className="inline-flex items-center gap-1 text-xs text-text-dim hover:text-foreground transition-colors"
        >
          <X className="size-3.5" />
          Clear
        </button>
      )}
    </div>
  )
}
