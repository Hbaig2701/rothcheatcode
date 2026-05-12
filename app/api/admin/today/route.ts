import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Test accounts to exclude from the timeline.
const TEST_EMAILS = ['hbkidspare+homework@gmail.com', 'allank94@live.com'];

const TZ = 'America/New_York';

/**
 * Compute the UTC instant for midnight on a given EST/EDT calendar date.
 * Searches both candidate UTC offsets (-04:00 EDT, -05:00 EST) and picks
 * whichever one round-trips back to "00:00 on dateStr" in NY local time.
 * Handles DST transitions correctly without a date library.
 */
function nyMidnightUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  for (const offsetMinutes of [240, 300]) {
    const candidate = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) + offsetMinutes * 60_000);
    const parts = fmt.formatToParts(candidate);
    const got = `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`;
    const hour = parts.find(p => p.type === 'hour')?.value;
    if (got === dateStr && hour === '00') return candidate;
  }
  // Spring-forward gap (00:00–01:00 doesn't exist) — fall back to 04:00 UTC.
  return new Date(Date.UTC(y, m - 1, d, 4, 0, 0));
}

function todayInNY(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + n));
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(next.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export type ActivityKind =
  | 'login'
  | 'scenario_run'
  | 'client_created'
  | 'pdf_export'
  | 'sales_call'
  | 'product_created'
  | 'support_ticket'
  | 'ticket_viewed'
  | 'ticket_commented';

export interface ActivityEvent {
  ts: string;          // ISO UTC
  kind: ActivityKind;
  detail?: string;     // human-readable extra context (client name, ticket subject, etc.)
  href?: string;       // optional link to relevant entity
  meta?: Record<string, string | number>;
}

export interface UserActivity {
  user_id: string;
  email: string;
  name: string | null;
  lastActivityAt: string;
  counts: Record<ActivityKind, number>;
  events: ActivityEvent[];
}

export interface TodayResponse {
  date: string;             // YYYY-MM-DD in EST
  tz: string;
  totals: Record<ActivityKind, number>;
  activeUserCount: number;
  users: UserActivity[];
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const admin = createAdminClient();

    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date') ?? todayInNY();

    const startUTC = nyMidnightUTC(dateStr);
    const endUTC = nyMidnightUTC(addDays(dateStr, 1));
    const startISO = startUTC.toISOString();
    const endISO = endUTC.toISOString();

    // Test account filter — id-based exclusion.
    const { data: testProfiles } = await admin
      .from('profiles')
      .select('id')
      .in('email', TEST_EMAILS);
    const testIds = new Set((testProfiles ?? []).map(p => p.id));

    // Pull all event tables for the day in parallel.
    const [
      loginsRes,
      scenariosRes,
      clientsCreatedRes,
      pdfsRes,
      salesCallsRes,
      productsRes,
      ticketsRes,
      ticketEventsRes,
    ] = await Promise.all([
      admin.from('login_log')
        .select('user_id, created_at')
        .gte('created_at', startISO).lt('created_at', endISO),
      admin.from('projections')
        .select('user_id, client_id, created_at')
        .gte('created_at', startISO).lt('created_at', endISO),
      admin.from('clients')
        .select('id, user_id, name, created_at')
        .gte('created_at', startISO).lt('created_at', endISO),
      admin.from('export_log')
        .select('user_id, client_id, export_type, created_at')
        .eq('export_type', 'pdf')
        .gte('created_at', startISO).lt('created_at', endISO),
      admin.from('sales_calls')
        .select('user_id, title, status, created_at')
        .gte('created_at', startISO).lt('created_at', endISO),
      admin.from('custom_products')
        .select('user_id, name, category, created_at')
        .gte('created_at', startISO).lt('created_at', endISO),
      admin.from('support_tickets')
        .select('id, user_id, subject, severity, created_at')
        .gte('created_at', startISO).lt('created_at', endISO),
      // Ticket viewed / commented events on tickets owned by the same user.
      // We surface only the user's activity on their OWN tickets — admin
      // replies on a ticket belong to the admin's row, not the advisor's.
      // 'comment_added' is the public-comment event_type written by
      // /api/support-tickets/[id]/comments; 'ticket_viewed' is written by
      // the advisor-facing detail page when the owner opens it (throttled
      // to one event per 5 min per user+ticket so refreshes don't spam).
      // 'internal_comment_added' is intentionally excluded — that's the
      // admin's internal note and not user-visible activity.
      admin.from('support_ticket_events')
        .select('user_id, ticket_id, event_type, created_at')
        .in('event_type', ['ticket_viewed', 'comment_added'])
        .gte('created_at', startISO).lt('created_at', endISO),
    ]);

    // Collect all referenced client_ids so we can resolve names in one round trip.
    const clientIdsToFetch = new Set<string>();
    for (const r of scenariosRes.data ?? []) if (r.client_id) clientIdsToFetch.add(r.client_id);
    for (const r of pdfsRes.data ?? []) if (r.client_id) clientIdsToFetch.add(r.client_id);
    const referencedClientIds = Array.from(clientIdsToFetch);
    const clientNameById = new Map<string, string>();
    if (referencedClientIds.length > 0) {
      const { data: clientRows } = await admin
        .from('clients')
        .select('id, name')
        .in('id', referencedClientIds);
      for (const c of clientRows ?? []) clientNameById.set(c.id, c.name);
    }
    // Clients created today: name comes from the row itself (no extra join).
    for (const c of clientsCreatedRes.data ?? []) {
      if (c.id && c.name) clientNameById.set(c.id, c.name);
    }

    // Look up ticket subjects for ticket events so each timeline row can
    // say "Viewed ticket: <subject>" rather than just "Viewed ticket".
    // Tickets filed today are already in ticketsRes; older tickets are
    // fetched in a second batched lookup.
    const ticketIdsToFetch = new Set<string>();
    for (const r of ticketEventsRes.data ?? []) if (r.ticket_id) ticketIdsToFetch.add(r.ticket_id);
    // Drop ids we already have from ticketsRes
    for (const t of ticketsRes.data ?? []) ticketIdsToFetch.delete(t.id);
    const ticketSubjectById = new Map<string, string>();
    const ticketOwnerById = new Map<string, string>();
    for (const t of ticketsRes.data ?? []) {
      if (t.id) {
        if (t.subject) ticketSubjectById.set(t.id, t.subject);
        if (t.user_id) ticketOwnerById.set(t.id, t.user_id);
      }
    }
    if (ticketIdsToFetch.size > 0) {
      const { data: ticketRows } = await admin
        .from('support_tickets')
        .select('id, subject, user_id')
        .in('id', Array.from(ticketIdsToFetch));
      for (const t of ticketRows ?? []) {
        if (t.subject) ticketSubjectById.set(t.id, t.subject);
        if (t.user_id) ticketOwnerById.set(t.id, t.user_id);
      }
    }

    // Build the per-user event stream. We exclude test accounts here rather
    // than in each query because user_id NOT IN (...) is awkward across 7
    // queries and the filter is cheap in JS.
    const userEvents = new Map<string, ActivityEvent[]>();
    const push = (uid: string | null | undefined, ev: ActivityEvent) => {
      if (!uid || testIds.has(uid)) return;
      if (!userEvents.has(uid)) userEvents.set(uid, []);
      userEvents.get(uid)!.push(ev);
    };

    for (const r of loginsRes.data ?? []) {
      push(r.user_id, { ts: r.created_at, kind: 'login' });
    }
    for (const r of scenariosRes.data ?? []) {
      const name = r.client_id ? clientNameById.get(r.client_id) : undefined;
      push(r.user_id, {
        ts: r.created_at,
        kind: 'scenario_run',
        detail: name,
        href: r.client_id ? `/clients/${r.client_id}/results` : undefined,
      });
    }
    for (const r of clientsCreatedRes.data ?? []) {
      push(r.user_id, {
        ts: r.created_at,
        kind: 'client_created',
        detail: r.name ?? undefined,
        href: r.id ? `/clients/${r.id}/results` : undefined,
      });
    }
    for (const r of pdfsRes.data ?? []) {
      const name = r.client_id ? clientNameById.get(r.client_id) : undefined;
      push(r.user_id, {
        ts: r.created_at,
        kind: 'pdf_export',
        detail: name,
        href: r.client_id ? `/clients/${r.client_id}/results` : undefined,
      });
    }
    for (const r of salesCallsRes.data ?? []) {
      push(r.user_id, {
        ts: r.created_at,
        kind: 'sales_call',
        detail: r.title ?? undefined,
        meta: r.status ? { status: r.status } : undefined,
      });
    }
    for (const r of productsRes.data ?? []) {
      push(r.user_id, {
        ts: r.created_at,
        kind: 'product_created',
        detail: r.name ?? undefined,
        meta: r.category ? { category: r.category } : undefined,
      });
    }
    for (const r of ticketsRes.data ?? []) {
      push(r.user_id, {
        ts: r.created_at,
        kind: 'support_ticket',
        detail: r.subject ?? undefined,
        href: r.id ? `/support-centre?ticket=${r.id}` : undefined,
        meta: r.severity ? { severity: r.severity } : undefined,
      });
    }
    for (const r of ticketEventsRes.data ?? []) {
      const subject = r.ticket_id ? ticketSubjectById.get(r.ticket_id) : undefined;
      const kind: ActivityKind = r.event_type === 'ticket_viewed' ? 'ticket_viewed' : 'ticket_commented';
      push(r.user_id, {
        ts: r.created_at,
        kind,
        detail: subject,
        href: r.ticket_id ? `/support-centre?ticket=${r.ticket_id}` : undefined,
      });
    }

    const activeUserIds = Array.from(userEvents.keys());

    // Resolve names + emails for the active users.
    const [emailRes, nameRes] = await Promise.all([
      admin.from('profiles').select('id, email').in('id', activeUserIds.length ? activeUserIds : ['00000000-0000-0000-0000-000000000000']),
      admin.from('user_settings').select('user_id, first_name, last_name').in('user_id', activeUserIds.length ? activeUserIds : ['00000000-0000-0000-0000-000000000000']),
    ]);
    const emailById = new Map<string, string>();
    for (const r of emailRes.data ?? []) emailById.set(r.id, r.email);
    const nameById = new Map<string, string>();
    for (const r of nameRes.data ?? []) {
      const parts = [r.first_name, r.last_name].filter(Boolean);
      if (parts.length > 0) nameById.set(r.user_id, parts.join(' '));
    }

    const emptyCounts = (): Record<ActivityKind, number> => ({
      login: 0, scenario_run: 0, client_created: 0, pdf_export: 0, ticket_viewed: 0, ticket_commented: 0,
      sales_call: 0, product_created: 0, support_ticket: 0,
    });

    const users: UserActivity[] = activeUserIds.map(uid => {
      const events = userEvents.get(uid)!.sort((a, b) => a.ts.localeCompare(b.ts));
      const counts = emptyCounts();
      for (const e of events) counts[e.kind]++;
      return {
        user_id: uid,
        email: emailById.get(uid) ?? '(unknown)',
        name: nameById.get(uid) ?? null,
        lastActivityAt: events[events.length - 1].ts,
        counts,
        events,
      };
    });
    // Most-recent activity first.
    users.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));

    const totals = emptyCounts();
    for (const u of users) {
      for (const k of Object.keys(totals) as ActivityKind[]) totals[k] += u.counts[k];
    }

    const response: TodayResponse = {
      date: dateStr,
      tz: TZ,
      totals,
      activeUserCount: users.length,
      users,
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error('Admin today error:', error);
    return NextResponse.json({ error: 'Failed to fetch today activity' }, { status: 500 });
  }
}
