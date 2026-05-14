'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Check, MessageSquare, RefreshCw, UserPlus, FileText, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Notification } from '@/lib/types/notification'

const POLL_INTERVAL_MS = 30_000

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  support_ticket_reply: MessageSquare,
  support_ticket_status_change: RefreshCw,
  support_ticket_viewed: Eye,
  intake_completed: UserPlus,
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)

  // Lightweight unread-count poll. Runs whether or not the dropdown is open
  // so the badge stays current. The full list only fetches when opened.
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/unread-count')
      if (!res.ok) return
      const j: { count: number } = await res.json()
      setUnreadCount(j.count)
    } catch {
      // Silent — not worth surfacing transient network blips on the bell
    }
  }, [])

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const j: { notifications: Notification[] } = await res.json()
      setNotifications(j.notifications)
      setUnreadCount(j.notifications.filter((n) => !n.is_read).length)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchUnreadCount()
    const id = setInterval(() => void fetchUnreadCount(), POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [fetchUnreadCount])

  // Fetch the full list whenever the dropdown opens
  useEffect(() => {
    if (open) void fetchList()
  }, [open, fetchList])

  async function markRead(notification: Notification) {
    if (notification.is_read) return
    setNotifications((prev) =>
      prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
    )
    setUnreadCount((c) => Math.max(0, c - 1))
    await fetch(`/api/notifications/${notification.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_read: true }),
    })
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    setUnreadCount(0)
    await fetch('/api/notifications/read-all', { method: 'POST' })
  }

  function handleClick(notification: Notification) {
    void markRead(notification)
    if (notification.link_url) {
      setOpen(false)
      router.push(notification.link_url)
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-text-dim hover:bg-accent hover:text-foreground transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[380px] max-w-[calc(100vw-2rem)] p-0 overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-border-default px-4 py-2.5">
          <p className="text-sm font-semibold text-foreground">Notifications</p>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-xs text-text-dim hover:text-foreground transition-colors"
            >
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          {loading && notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-text-dim">Loading…</p>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <Bell className="mx-auto size-8 text-text-dimmer mb-2" />
              <p className="text-sm text-text-dim">You&apos;re all caught up</p>
            </div>
          ) : (
            <ul className="divide-y divide-border-default/50">
              {notifications.map((n) => {
                const Icon = TYPE_ICON[n.type] ?? FileText
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleClick(n)}
                      className={cn(
                        'w-full text-left px-4 py-3 transition-colors hover:bg-accent/50',
                        !n.is_read && 'bg-accent/30'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            'flex size-7 shrink-0 items-center justify-center rounded-full',
                            !n.is_read ? 'bg-gold/20 text-gold' : 'bg-muted text-text-dim'
                          )}
                        >
                          <Icon className="size-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p
                              className={cn(
                                'text-sm leading-tight',
                                !n.is_read ? 'font-semibold text-foreground' : 'text-foreground/90'
                              )}
                            >
                              {n.title}
                            </p>
                            {!n.is_read && (
                              <span
                                className="size-2 shrink-0 rounded-full bg-gold"
                                aria-label="Unread"
                              />
                            )}
                          </div>
                          {n.body && (
                            <p className="text-xs text-text-dim line-clamp-2 mt-0.5">{n.body}</p>
                          )}
                          <p className="text-[11px] text-text-dimmer mt-1">{relativeTime(n.created_at)}</p>
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {notifications.length > 0 && (
          <div className="border-t border-border-default px-4 py-2">
            <button
              type="button"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="inline-flex items-center gap-1.5 text-xs text-text-dim hover:text-foreground disabled:opacity-50 disabled:hover:text-text-dim transition-colors"
            >
              <Check className="size-3.5" />
              {unreadCount === 0 ? 'All read' : `Mark ${unreadCount} as read`}
            </button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
