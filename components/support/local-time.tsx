'use client'

import { useEffect, useState } from 'react'

// Server-rendered dates use Node's runtime timezone (UTC on Vercel) which
// shows up as wrong-by-N-hours for users in other timezones. Defer rendering
// to the client so toLocaleString uses the user's local timezone.
//
// First paint shows a stable fallback (raw ISO date portion) to avoid
// hydration mismatches; the full local string swaps in after mount.

interface LocalTimeProps {
  iso: string
  /** Predefined format. Defaults to medium date + short time. */
  format?: 'date-time' | 'date' | 'time' | 'relative'
}

export function LocalTime({ iso, format = 'date-time' }: LocalTimeProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) {
    // SSR/first-paint fallback — show ISO date portion only, no timezone confusion
    return <span suppressHydrationWarning>{iso.slice(0, 10)}</span>
  }

  const d = new Date(iso)
  let text: string
  switch (format) {
    case 'date':
      text = d.toLocaleDateString(undefined, { dateStyle: 'medium' })
      break
    case 'time':
      text = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      break
    case 'relative':
      text = relativeTime(d)
      break
    case 'date-time':
    default:
      text = d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  }

  return <span suppressHydrationWarning title={d.toString()}>{text}</span>
}

function relativeTime(d: Date): string {
  const ms = Date.now() - d.getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
