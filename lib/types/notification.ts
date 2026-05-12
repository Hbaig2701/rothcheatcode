export const NOTIFICATION_TYPES = [
  'support_ticket_reply',
  'support_ticket_status_change',
  'support_ticket_viewed',
  'intake_completed',
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export interface Notification {
  id: string
  user_id: string
  type: NotificationType | string
  title: string
  body: string | null
  link_url: string | null
  related_id: string | null
  is_read: boolean
  read_at: string | null
  created_at: string
}

export interface CreateNotificationInput {
  user_id: string
  type: NotificationType
  title: string
  body?: string | null
  link_url?: string | null
  related_id?: string | null
}
