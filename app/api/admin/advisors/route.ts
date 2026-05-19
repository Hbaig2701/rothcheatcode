import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe';
import { PLAN_PRICES } from '@/lib/config/plans';
import { isInternalTeamEmail } from '@/lib/auth/internal-team';

// Test accounts to exclude from all metrics
const TEST_EMAILS = ['hbkidspare+homework@gmail.com', 'allank94@live.com'];

// Same-day refunds — accounts that signed up and were refunded the same
// day. Their subscription_status in the DB is 'canceled' (Stripe canceled
// the sub after the refund), but treating them as "churned" distorts the
// churn metric and the admin's mental model of who actually left. We
// override their reported subscriptionStatus to 'inactive' so they drop
// out of the 'churned' advisor view, while staying visible in the 'all'
// view. Revenue route excludes them from the churn-rate calculation too.
const REFUNDED_SAME_DAY_EMAILS = ['derrick@derrickphelps.com'];

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

    // Use admin client (bypasses RLS) for cross-user queries
    const admin = createAdminClient();

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status') ?? 'all';
    const search = searchParams.get('search') ?? '';

    // Fetch paying + churned advisor profiles (exclude test accounts and non-paying)
    const showChurned = searchParams.get('churned') === 'true';
    let profilesQuery = admin
      .from('profiles')
      .select('id, email, created_at, role, is_active, plan, subscription_status, billing_cycle, stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end, canceled_at')
      .eq('role', 'advisor')
      .not('email', 'in', `(${TEST_EMAILS.join(',')})`)
      .not('stripe_customer_id', 'is', null)
      .order('created_at', { ascending: false });

    if (!showChurned) {
      // By default show active/trialing only; when churned=true show all including canceled
    }

    const { data: rawProfiles, error: profilesError } = await profilesQuery;

    if (profilesError) throw profilesError;
    if (!rawProfiles || rawProfiles.length === 0) {
      return NextResponse.json({ advisors: [], total: 0 });
    }

    // Strip internal team members (Vroom team accounts). Same rationale as
    // the revenue endpoint — these are internal users, not advisors paying
    // for the product, and they shouldn't appear in the advisor list metrics.
    const profiles = rawProfiles.filter((p) => !isInternalTeamEmail(p.email));
    if (profiles.length === 0) {
      return NextResponse.json({ advisors: [], total: 0 });
    }

    const advisorIds = profiles.map(p => p.id);

    // Fetch counts and names in parallel
    const [clientsRes, runsRes, exportsRes, loginsRes, settingsRes] = await Promise.all([
      admin.from('clients').select('user_id').in('user_id', advisorIds),
      admin.from('projections').select('user_id').in('user_id', advisorIds),
      admin.from('export_log').select('user_id').in('user_id', advisorIds),
      admin.from('login_log').select('user_id, created_at').in('user_id', advisorIds).order('created_at', { ascending: false }),
      admin.from('user_settings').select('user_id, first_name, last_name').in('user_id', advisorIds),
    ]);

    // Build count maps
    const clientCounts = new Map<string, number>();
    (clientsRes.data ?? []).forEach(r => clientCounts.set(r.user_id, (clientCounts.get(r.user_id) ?? 0) + 1));

    const runCounts = new Map<string, number>();
    (runsRes.data ?? []).forEach(r => runCounts.set(r.user_id, (runCounts.get(r.user_id) ?? 0) + 1));

    const exportCounts = new Map<string, number>();
    (exportsRes.data ?? []).forEach(r => exportCounts.set(r.user_id, (exportCounts.get(r.user_id) ?? 0) + 1));

    // Names
    const nameMap = new Map<string, string>();
    (settingsRes.data ?? []).forEach(r => {
      const parts = [r.first_name, r.last_name].filter(Boolean);
      if (parts.length > 0) nameMap.set(r.user_id, parts.join(' '));
    });

    // Last login and session count per user
    const lastLogins = new Map<string, string>();
    const sessionCounts = new Map<string, number>();
    (loginsRes.data ?? []).forEach(r => {
      if (!lastLogins.has(r.user_id)) lastLogins.set(r.user_id, r.created_at);
      sessionCounts.set(r.user_id, (sessionCounts.get(r.user_id) ?? 0) + 1);
    });

    // Fetch actual subscription pricing from Stripe per advisor so we can
    // surface the TRUE net price each advisor pays (after coupons/discounts).
    // Advisors with no Stripe sub or whose sub fetch fails get null pricing.
    const stripe = getStripe();
    type Pricing = {
      netMonthly: number; // dollars/month after discounts (annual sub ÷ 12)
      netInterval: number; // dollars per billing cycle after discounts
      listPriceInterval: number; // dollars per cycle BEFORE discount
      interval: 'month' | 'year' | string;
      discountPercent: number; // 0-100; combined effective discount on this cycle
      discountLabel: string | null; // human-readable coupon name(s)
      currentPeriodEnd: number | null; // unix seconds; from Stripe (more accurate than profiles)
      cancelAtPeriodEnd: boolean; // true once customer hits cancel; status stays 'active' until period ends
      canceledAt: number | null; // unix seconds; when the cancellation was scheduled
    };
    const pricingMap = new Map<string, Pricing>();

    // Pass 1: seed every advisor with their plan's LIST price using the
    // plan + billing_cycle columns. This guarantees the Net Price column
    // never goes blank just because a Stripe call hiccuped.
    for (const p of profiles) {
      const plan = (p.plan ?? 'standard') as keyof typeof PLAN_PRICES;
      const cycle = p.billing_cycle === 'annual' ? 'annual' : 'monthly';
      const planPrice = PLAN_PRICES[plan]?.[cycle];
      if (!planPrice) continue;
      const interval = cycle === 'annual' ? 'year' : 'month';
      pricingMap.set(p.id, {
        netMonthly: cycle === 'annual' ? planPrice.amount / 12 : planPrice.amount,
        netInterval: planPrice.amount,
        listPriceInterval: planPrice.amount,
        interval,
        discountPercent: 0,
        discountLabel: null,
        currentPeriodEnd: null,
        // Seed from DB; pass 2 overlays with the live Stripe truth.
        cancelAtPeriodEnd: p.cancel_at_period_end === true,
        canceledAt: null,
      });
    }

    // Pass 2: overlay actual Stripe data (post-discount price + true renewal
    // date) for every advisor with a sub. We just expand latest_invoice — it
    // already reflects every discount Stripe applied. If a single retrieve
    // fails, that advisor falls back to the list-price seed from pass 1.
    const subFetches = profiles
      .filter(p => p.stripe_subscription_id)
      .map(async (p) => {
        try {
          const sub = await stripe.subscriptions.retrieve(p.stripe_subscription_id!, {
            expand: ['latest_invoice'],
          });
          const item = sub.items?.data?.[0];
          const listPrice = item?.price?.unit_amount != null
            ? item.price.unit_amount / 100
            : pricingMap.get(p.id)?.listPriceInterval ?? 0;
          const interval = item?.price?.recurring?.interval
            ?? pricingMap.get(p.id)?.interval
            ?? 'month';

          let netInterval = listPrice;
          const discountLabels: string[] = [];

          const latestInvoice = (sub as unknown as { latest_invoice?: {
            subtotal?: number;
            total?: number;
            amount_paid?: number;
            total_discount_amounts?: Array<{ amount: number; discount: string | { coupon?: { name?: string | null; percent_off?: number | null; amount_off?: number | null } } }>;
          } | string | null }).latest_invoice;

          if (latestInvoice && typeof latestInvoice === 'object') {
            const tot = latestInvoice.total ?? 0;
            const paid = latestInvoice.amount_paid ?? 0;
            const sub_amt = latestInvoice.subtotal ?? 0;
            if (tot > 0) netInterval = tot / 100;
            else if (paid > 0) netInterval = paid / 100;
            else if (sub_amt > 0) netInterval = sub_amt / 100;

            for (const d of latestInvoice.total_discount_amounts ?? []) {
              if (!d || typeof d.discount === 'string') continue;
              const coupon = d.discount.coupon;
              if (!coupon) continue;
              if (coupon.percent_off) discountLabels.push(coupon.name ?? `${coupon.percent_off}% off`);
              else if (coupon.amount_off) discountLabels.push(coupon.name ?? `$${(coupon.amount_off / 100).toFixed(0)} off`);
            }
          }

          const discountPercent = listPrice > 0 && netInterval < listPrice
            ? Math.round(((listPrice - netInterval) / listPrice) * 1000) / 10
            : 0;

          // Stripe is the source of truth for cancellation state — read it
          // directly off the live subscription. The DB's column will catch
          // up via webhook on the next event, but until then we surface the
          // fresher Stripe value in the admin UI.
          const subAny = sub as unknown as {
            current_period_end?: number | null;
            cancel_at_period_end?: boolean;
            canceled_at?: number | null;
          };

          pricingMap.set(p.id, {
            netMonthly: interval === 'year' ? netInterval / 12 : netInterval,
            netInterval,
            listPriceInterval: listPrice,
            interval,
            discountPercent,
            discountLabel: discountLabels.length > 0 ? Array.from(new Set(discountLabels)).join(', ') : null,
            currentPeriodEnd: subAny.current_period_end ?? null,
            cancelAtPeriodEnd: subAny.cancel_at_period_end === true,
            canceledAt: subAny.canceled_at ?? null,
          });

          // Mirror back into the DB if it disagrees. Keeps the column fresh
          // for analytics queries and means the next webhook write isn't the
          // first time we see a pending cancellation.
          if (
            (subAny.cancel_at_period_end === true) !== (p.cancel_at_period_end === true)
            || (subAny.canceled_at != null) !== (p.canceled_at != null)
          ) {
            await admin
              .from('profiles')
              .update({
                cancel_at_period_end: subAny.cancel_at_period_end === true,
                canceled_at: subAny.canceled_at ? new Date(subAny.canceled_at * 1000).toISOString() : null,
              })
              .eq('id', p.id);
          }
        } catch (err) {
          // Stripe fetch failed (sub deleted, network blip, etc.) — keep
          // the list-price seed from pass 1 so the column doesn't go blank.
          console.error(`[admin/advisors] Stripe sub fetch failed for ${p.id}:`, err instanceof Error ? err.message : err);
        }
      });
    await Promise.all(subFetches);

    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const advisors = profiles.map(p => {
      const lastLogin = lastLogins.get(p.id) ?? null;
      const lastActivity = lastLogin ? new Date(lastLogin) : new Date(p.created_at);
      const isRecentlyActive = lastActivity > fourteenDaysAgo;
      const isDeactivated = p.is_active === false;
      const isRefundedSameDay = REFUNDED_SAME_DAY_EMAILS.includes(p.email ?? '');
      const pricing = pricingMap.get(p.id) ?? null;

      return {
        id: p.id,
        name: nameMap.get(p.id) ?? null,
        email: p.email,
        createdAt: p.created_at,
        clientCount: clientCounts.get(p.id) ?? 0,
        scenarioRunCount: runCounts.get(p.id) ?? 0,
        exportCount: exportCounts.get(p.id) ?? 0,
        sessionCount: sessionCounts.get(p.id) ?? 0,
        lastLogin,
        status: isDeactivated ? 'deactivated' as const : (isRecentlyActive ? 'active' as const : 'inactive' as const),
        // Same-day refunds get their canceled status remapped to 'inactive'
        // so they don't pollute the churn view.
        subscriptionStatus: isRefundedSameDay ? 'inactive' : (p.subscription_status ?? 'active'),
        billingCycle: p.billing_cycle ?? null,
        currentPeriodEnd: pricing?.currentPeriodEnd
          ? new Date(pricing.currentPeriodEnd * 1000).toISOString()
          : (p.current_period_end ?? null),
        cancelAtPeriodEnd: pricing?.cancelAtPeriodEnd ?? p.cancel_at_period_end === true,
        canceledAt: pricing?.canceledAt
          ? new Date(pricing.canceledAt * 1000).toISOString()
          : (p.canceled_at ?? null),
        // Pricing — null when no Stripe sub or fetch failed.
        netMonthly: pricing?.netMonthly ?? null,
        netInterval: pricing?.netInterval ?? null,
        listPriceInterval: pricing?.listPriceInterval ?? null,
        priceInterval: pricing?.interval ?? null,
        discountPercent: pricing?.discountPercent ?? 0,
        discountLabel: pricing?.discountLabel ?? null,
      };
    });

    // Apply filters
    let filtered = advisors;
    if (statusFilter !== 'all') {
      filtered = filtered.filter(a => a.status === statusFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(a => a.email.toLowerCase().includes(q) || (a.name && a.name.toLowerCase().includes(q)));
    }

    return NextResponse.json({ advisors: filtered, total: filtered.length });
  } catch (error) {
    console.error('Admin advisors error:', error);
    return NextResponse.json({ error: 'Failed to fetch advisors' }, { status: 500 });
  }
}
