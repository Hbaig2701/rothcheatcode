import {
  STATUS_LABELS,
  SEVERITY_LABELS,
  CATEGORY_LABELS,
  type SupportSeverity,
  type SupportCategory,
} from '@/lib/types/support'

const SEVERITY_EMOJI: Record<SupportSeverity, string> = {
  low: ':white_circle:',
  medium: ':large_blue_circle:',
  high: ':large_orange_circle:',
  critical: ':red_circle:',
}

interface NewTicketPayload {
  ticketId: string
  subject: string
  description: string
  severity: SupportSeverity
  category: SupportCategory
  advisorName: string
  advisorEmail: string | null
  clientName: string | null
}

function appUrl(path: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    'https://app.retirementexpert.ai'
  const cleaned = base.endsWith('/') ? base.slice(0, -1) : base
  return `${cleaned}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * Posts a new-ticket notification to the Slack webhook configured via
 * SLACK_SUPPORT_WEBHOOK_URL. No-op if the env var is unset (so dev/local
 * doesn't error). Errors are logged but never thrown — Slack being down
 * must never block a ticket from being created.
 */
export async function notifySlackNewTicket(payload: NewTicketPayload): Promise<void> {
  const webhook = process.env.SLACK_SUPPORT_WEBHOOK_URL
  if (!webhook) return

  const severityEmoji = SEVERITY_EMOJI[payload.severity]
  const severityLabel = SEVERITY_LABELS[payload.severity]
  const categoryLabel = CATEGORY_LABELS[payload.category]
  const truncatedDescription = payload.description.length > 500
    ? payload.description.slice(0, 500) + '…'
    : payload.description

  const url = appUrl(`/support-centre/${payload.ticketId}`)

  const fields: Array<{ type: 'mrkdwn'; text: string }> = [
    { type: 'mrkdwn', text: `*Severity:*\n${severityEmoji} ${severityLabel}` },
    { type: 'mrkdwn', text: `*Category:*\n${categoryLabel}` },
    {
      type: 'mrkdwn',
      text: `*Advisor:*\n${payload.advisorName}${payload.advisorEmail ? `\n${payload.advisorEmail}` : ''}`,
    },
  ]
  if (payload.clientName) {
    fields.push({ type: 'mrkdwn', text: `*Client:*\n${payload.clientName}` })
  }

  const body = {
    text: `New support ticket: ${payload.subject}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `🎫 New support ticket`, emoji: true },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*<${url}|${escapeForSlack(payload.subject)}>*` },
      },
      { type: 'section', fields },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `>${escapeForSlack(truncatedDescription).replace(/\n/g, '\n>')}` },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View in Support Centre', emoji: true },
            url,
            style: 'primary',
          },
        ],
      },
    ],
  }

  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('[slack] webhook returned non-OK', res.status, text)
    }
  } catch (err) {
    console.error('[slack] webhook post failed', err)
  }
}

interface NewCommentPayload {
  ticketId: string
  ticketSubject: string
  ticketStatus: string
  authorName: string
  authorIsAdmin: boolean
  body: string
}

/**
 * Notifies Slack when an advisor (non-admin) replies on a ticket — useful
 * because it usually means they're waiting on us. Admin replies are skipped
 * since they originate from your team.
 */
export async function notifySlackNewComment(payload: NewCommentPayload): Promise<void> {
  const webhook = process.env.SLACK_SUPPORT_WEBHOOK_URL
  if (!webhook) return
  if (payload.authorIsAdmin) return

  const url = appUrl(`/support-centre/${payload.ticketId}`)
  const truncated = payload.body.length > 500 ? payload.body.slice(0, 500) + '…' : payload.body

  const body = {
    text: `New reply on "${payload.ticketSubject}" from ${payload.authorName}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:speech_balloon: *${escapeForSlack(payload.authorName)}* replied on <${url}|${escapeForSlack(payload.ticketSubject)}> (${STATUS_LABELS[payload.ticketStatus as keyof typeof STATUS_LABELS] ?? payload.ticketStatus})`,
        },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `>${escapeForSlack(truncated).replace(/\n/g, '\n>')}` },
      },
    ],
  }

  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('[slack] webhook returned non-OK', res.status, text)
    }
  } catch (err) {
    console.error('[slack] webhook post failed', err)
  }
}

function escapeForSlack(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
