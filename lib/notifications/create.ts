import { createAdminClient } from '@/lib/supabase/admin'
import type { CreateNotificationInput } from '@/lib/types/notification'

/**
 * Insert a notification for a user. Always uses the admin client so it works
 * regardless of who's making the API call (e.g., an admin replying creates
 * a notification *for the advisor* — RLS would block that path otherwise).
 *
 * Best-effort: failures are logged but never thrown. A flaky notification
 * insert must never break the underlying action (ticket reply, status change,
 * intake submission, etc.).
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.from('notifications').insert({
      user_id: input.user_id,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link_url: input.link_url ?? null,
      related_id: input.related_id ?? null,
    })
    if (error) {
      console.error('[notifications] insert failed', error)
    }
  } catch (err) {
    console.error('[notifications] insert exception', err)
  }
}
