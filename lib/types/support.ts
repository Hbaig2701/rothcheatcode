export const SUPPORT_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const
export type SupportSeverity = (typeof SUPPORT_SEVERITIES)[number]

export const SUPPORT_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number]

export const SUPPORT_CATEGORIES = ['bug', 'data_issue', 'feature_request', 'question', 'billing', 'other'] as const
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number]

export const SUPPORT_STATUSES = ['open', 'in_progress', 'waiting_on_user', 'resolved', 'closed'] as const
export type SupportStatus = (typeof SUPPORT_STATUSES)[number]

export const STATUS_LABELS: Record<SupportStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  waiting_on_user: 'Waiting on User',
  resolved: 'Resolved',
  closed: 'Closed',
}

export const SEVERITY_LABELS: Record<SupportSeverity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
}

export const PRIORITY_LABELS: Record<SupportPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
}

export const CATEGORY_LABELS: Record<SupportCategory, string> = {
  bug: 'Bug',
  data_issue: 'Data Issue',
  feature_request: 'Feature Request',
  question: 'Question',
  billing: 'Billing',
  other: 'Other',
}

export interface SupportTicket {
  id: string
  user_id: string
  client_id: string | null
  report_id: string | null
  subject: string
  description: string
  severity: SupportSeverity
  priority: SupportPriority
  category: SupportCategory
  status: SupportStatus
  assigned_to: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export interface SupportTicketAttachment {
  id: string
  ticket_id: string
  user_id: string
  file_path: string
  file_name: string
  mime_type: string
  file_size: number
  created_at: string
  /** When set, the attachment is rendered inline under the matching
   * comment in the conversation thread. NULL means it's a top-level
   * ticket attachment (the original "drop the report PDF" form path). */
  comment_id: string | null
}

export interface SupportTicketComment {
  id: string
  ticket_id: string
  user_id: string
  body: string
  is_internal: boolean
  created_at: string
  updated_at: string | null
}

export interface SupportTicketEvent {
  id: string
  ticket_id: string
  user_id: string
  event_type: string
  old_value: string | null
  new_value: string | null
  created_at: string
}

export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const

export const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024 // 25 MB
export const MAX_ATTACHMENTS_PER_TICKET = 5
