import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { PLAN_PRICES } from "@/lib/config/plans";
import { isInternalTeamEmail } from "@/lib/auth/internal-team";

// Test accounts to exclude from all metrics
const TEST_EMAILS = ['hbkidspare+homework@gmail.com', 'allank94@live.com'];

// Same-day refunds — these accounts signed up and were refunded on the
// same day, so they never generated revenue and shouldn't drag down the
// churn metric. They're still kept in the profile list (so the admin can
// see they exist), but excluded from the canceled / churn-rate
// calculations below. Add to this list when a similar case comes up.
const REFUNDED_SAME_DAY_EMAILS = ['derrick@derrickphelps.com'];

// In-memory cache so the admin dashboard doesn't trigger 30+ parallel Stripe
// reads on every refresh. Stripe rate limits + transient network blips were
// silently dropping subscribers from the MRR total, making the displayed
// numbers fluctuate between refreshes. Cache TTL is short enough that fresh
// signups / cancellations show up quickly but long enough to absorb a
// rapid-fire refresh storm.
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cached: { at: number; payload: unknown } | null = null;

// Chunk size for Stripe subscription retrieval. Smaller chunks avoid
// burst-induced 429s while keeping the total wallclock manageable.
const STRIPE_CONCURRENCY = 5;

async function chunkedAll<T, R>(
  items: T[],
  size: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const slice = items.slice(i, i + size);
    const slicedResults = await Promise.all(slice.map(worker));
    results.push(...slicedResults);
  }
  return results;
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (adminProfile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Allow ?refresh=1 to bypass the cache (e.g., after a known billing change)
    const url = new URL(request.url);
    const skipCache = url.searchParams.get("refresh") === "1";

    if (!skipCache && cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return NextResponse.json(cached.payload);
    }

    const admin = createAdminClient();
    const stripe = getStripe();

    const { data: rawProfiles } = await admin
      .from("profiles")
      .select("id, email, plan, subscription_status, billing_cycle, created_at, current_period_end, stripe_customer_id, stripe_subscription_id")
      .eq("role", "advisor")
      .not('email', 'in', `(${TEST_EMAILS.join(',')})`)
      .not('stripe_customer_id', 'is', null);

    if (!rawProfiles) {
      return NextResponse.json({ error: "Failed to fetch profiles" }, { status: 500 });
    }

    // Strip internal team members (Vroom domain). Without this filter,
    // internal accounts dragged MRR, signup counts, and churn numbers in
    // misleading directions. Domain-based so new team hires are excluded
    // automatically without a code change.
    const profiles = rawProfiles.filter((p) => !isInternalTeamEmail(p.email));

    const activeProfiles = profiles.filter(p =>
      p.stripe_subscription_id && (p.subscription_status === 'active' || p.subscription_status === 'trialing')
    );

    // Fetch Stripe subscriptions in chunks (avoid burst rate-limiting). For
    // each profile we ALWAYS fall back to the plan/billing_cycle list price
    // if the Stripe call fails — the worst case is we miss a discount on one
    // sub, NOT silently drop the customer from MRR like before.
    const subAmounts = new Map<string, { amount: number; interval: string; fellBack: boolean }>();

    // Seed every active profile with its list-price fallback first so the
    // map is complete even if every Stripe call fails.
    for (const p of activeProfiles) {
      const plan = (p.plan ?? 'standard') as keyof typeof PLAN_PRICES;
      const cycle = p.billing_cycle === 'annual' ? 'annual' : 'monthly';
      const planPrice = PLAN_PRICES[plan]?.[cycle];
      if (planPrice) {
        subAmounts.set(p.id, {
          amount: planPrice.amount,
          interval: cycle === 'annual' ? 'year' : 'month',
          fellBack: true,
        });
      }
    }

    let stripeSuccess = 0;
    let stripeFailures = 0;

    await chunkedAll(
      activeProfiles.filter(p => p.stripe_subscription_id),
      STRIPE_CONCURRENCY,
      async (p) => {
        try {
          const sub = await stripe.subscriptions.retrieve(p.stripe_subscription_id!, {
            expand: ['latest_invoice'],
          });
          const item = sub.items?.data?.[0];
          if (!item) return;
          const listPrice = (item.price?.unit_amount ?? 0) / 100;
          const interval = item.price?.recurring?.interval ?? 'month';

          let amount = listPrice;
          const latestInvoice = (sub as unknown as { latest_invoice?: { subtotal?: number; total?: number; amount_paid?: number } | string | null }).latest_invoice;
          if (latestInvoice && typeof latestInvoice === 'object') {
            const tot = latestInvoice.total ?? 0;
            const paid = latestInvoice.amount_paid ?? 0;
            if (tot > 0) amount = tot / 100;
            else if (paid > 0) amount = paid / 100;
          }

          subAmounts.set(p.id, { amount, interval, fellBack: false });
          stripeSuccess++;
        } catch (err) {
          stripeFailures++;
          console.error(`[admin/revenue] Stripe sub fetch failed for ${p.id}:`, err instanceof Error ? err.message : err);
          // List-price fallback already seeded — leave it as-is.
        }
      }
    );

    // MRR / ARR rollup
    let totalMRR = 0;
    let totalARR = 0;
    let activeSubscriptions = 0;
    let monthlyCount = 0;
    let annualCount = 0;
    let monthlyRevenue = 0;
    let annualRevenue = 0;

    for (const profile of activeProfiles) {
      const sub = subAmounts.get(profile.id);
      if (!sub) continue;
      activeSubscriptions++;
      const monthlyAmount = sub.interval === 'year' ? sub.amount / 12 : sub.amount;
      totalMRR += monthlyAmount;
      totalARR += monthlyAmount * 12;
      if (sub.interval === 'month') {
        monthlyCount++;
        monthlyRevenue += sub.amount;
      } else {
        annualCount++;
        annualRevenue += sub.amount;
      }
    }

    // Total cash collected from Stripe charges (paginated)
    let totalCashCollected = 0;
    try {
      let hasMore = true;
      let startingAfter: string | undefined;
      while (hasMore) {
        const params: Record<string, unknown> = { limit: 100 };
        if (startingAfter) params.starting_after = startingAfter;
        const charges = await stripe.charges.list(params as Parameters<typeof stripe.charges.list>[0]);
        for (const charge of charges.data) {
          if (charge.status === 'succeeded' && !charge.refunded) {
            totalCashCollected += (charge.amount - (charge.amount_refunded ?? 0)) / 100;
          }
        }
        hasMore = charges.has_more;
        if (charges.data.length > 0) {
          startingAfter = charges.data[charges.data.length - 1].id;
        } else {
          hasMore = false;
        }
      }
    } catch (err) {
      console.error("[admin/revenue] Failed to fetch Stripe charges:", err);
    }

    // Last-month MRR (for growth %) — same source-of-truth amounts
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    let lastMonthMRR = 0;
    for (const profile of activeProfiles) {
      const created = new Date(profile.created_at);
      if (created <= lastMonth) {
        const sub = subAmounts.get(profile.id);
        if (sub) {
          lastMonthMRR += sub.interval === 'year' ? sub.amount / 12 : sub.amount;
        }
      }
    }
    const mrrGrowth = lastMonthMRR > 0 ? ((totalMRR - lastMonthMRR) / lastMonthMRR) * 100 : 0;

    // 6-month trend (approximated using current per-sub amounts)
    const mrrTrend: { month: string; mrr: number; arr: number; subscribers: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date();
      monthDate.setMonth(monthDate.getMonth() - i);
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
      let monthMRR = 0;
      let subs = 0;
      for (const profile of profiles) {
        const created = new Date(profile.created_at);
        const wasActive = created <= monthEnd && (
          profile.subscription_status === 'active' ||
          profile.subscription_status === 'trialing' ||
          (profile.subscription_status === 'canceled' && profile.current_period_end && new Date(profile.current_period_end) >= monthEnd)
        );
        if (wasActive) {
          const sub = subAmounts.get(profile.id);
          if (sub) {
            monthMRR += sub.interval === 'year' ? sub.amount / 12 : sub.amount;
            subs++;
          }
        }
      }
      mrrTrend.push({
        month: monthDate.toLocaleDateString('en-US', { month: 'short' }),
        mrr: Math.round(monthMRR),
        arr: Math.round(monthMRR * 12),
        subscribers: subs,
      });
    }

    const pastDue = profiles.filter(p => p.subscription_status === 'past_due').length;
    // Exclude same-day refunds — they were never real customers, so counting
    // them as churn would distort the metric.
    const canceled = profiles.filter(p =>
      p.subscription_status === 'canceled' && !REFUNDED_SAME_DAY_EMAILS.includes(p.email ?? '')
    ).length;
    const churnEligibleProfiles = profiles.filter(p =>
      !REFUNDED_SAME_DAY_EMAILS.includes(p.email ?? '')
    ).length;
    const churnRate = churnEligibleProfiles > 0 ? (canceled / churnEligibleProfiles) * 100 : 0;

    const payload = {
      current: {
        mrr: Math.round(totalMRR),
        arr: Math.round(totalARR),
        activeSubscriptions,
        avgRevenuePerUser: activeSubscriptions > 0 ? Math.round(totalMRR / activeSubscriptions) : 0,
        totalCashCollected: Math.round(totalCashCollected),
      },
      growth: {
        mrrGrowth: Math.round(mrrGrowth * 10) / 10,
      },
      breakdown: {
        monthly: { count: monthlyCount, revenue: Math.round(monthlyRevenue) },
        annual: { count: annualCount, revenue: Math.round(annualRevenue) },
      },
      mrrTrend,
      health: {
        pastDue,
        canceled,
        churnRate: Math.round(churnRate * 10) / 10,
      },
      // Diagnostics: surface Stripe fetch reliability so we can spot regressions
      _meta: {
        cachedAt: new Date().toISOString(),
        cacheTtlSeconds: CACHE_TTL_MS / 1000,
        stripeFetches: { success: stripeSuccess, failures: stripeFailures },
      },
    };

    cached = { at: Date.now(), payload };
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Revenue API error:", error);
    return NextResponse.json(
      { error: "Failed to load revenue data" },
      { status: 500 }
    );
  }
}
