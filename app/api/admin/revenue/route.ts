import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

// Test accounts to exclude from all metrics
const TEST_EMAILS = ['hbkidspare+homework@gmail.com', 'allank94@live.com'];

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

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

    const admin = createAdminClient();
    const stripe = getStripe();

    // Get paying advisor profiles (have Stripe subscription, exclude test accounts)
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email, plan, subscription_status, billing_cycle, created_at, current_period_end, stripe_customer_id, stripe_subscription_id")
      .eq("role", "advisor")
      .not('email', 'in', `(${TEST_EMAILS.join(',')})`)
      .not('stripe_customer_id', 'is', null);

    if (!profiles) {
      return NextResponse.json({ error: "Failed to fetch profiles" }, { status: 500 });
    }

    // Fetch actual subscription data from Stripe for active subscribers
    const activeProfiles = profiles.filter(p =>
      p.stripe_subscription_id && (p.subscription_status === 'active' || p.subscription_status === 'trialing')
    );

    // Batch fetch Stripe subscriptions (actual amounts after discounts)
    const subAmounts = new Map<string, { amount: number; interval: string }>();
    const subFetches = activeProfiles
      .filter(p => p.stripe_subscription_id)
      .map(async (p) => {
        try {
          const sub = await stripe.subscriptions.retrieve(p.stripe_subscription_id!);
          const item = sub.items?.data?.[0];
          if (item) {
            // amount is the actual price after any coupon/discount, in cents
            const amount = (item.price?.unit_amount ?? 0) / 100;
            const interval = item.price?.recurring?.interval ?? 'month';

            // Apply subscription-level discounts
            let finalAmount = amount;
            const discounts = sub.discounts ?? [];
            for (const d of discounts) {
              if (typeof d === 'string') continue;
              const coupon = typeof d.source?.coupon === 'object' ? d.source.coupon : null;
              if (coupon?.percent_off) {
                finalAmount *= (1 - coupon.percent_off / 100);
              }
              if (coupon?.amount_off) {
                finalAmount = Math.max(0, finalAmount - coupon.amount_off / 100);
              }
            }
            subAmounts.set(p.id, { amount: finalAmount, interval });
          }
        } catch (err) {
          // If subscription fetch fails, skip (might be deleted in Stripe)
          console.error(`Failed to fetch subscription ${p.stripe_subscription_id}:`, err);
        }
      });

    await Promise.all(subFetches);

    // Calculate MRR using actual Stripe amounts
    let totalMRR = 0;
    let totalARR = 0;
    let activeSubscriptions = 0;
    let monthlyCount = 0;
    let annualCount = 0;
    let monthlyRevenue = 0;
    let annualRevenue = 0;

    activeProfiles.forEach(profile => {
      const sub = subAmounts.get(profile.id);
      if (!sub) return;

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
    });

    // Total cash collected: query Stripe for actual charges
    let totalCashCollected = 0;
    try {
      // Get all successful charges (paginate through all)
      let hasMore = true;
      let startingAfter: string | undefined;
      while (hasMore) {
        const params: Record<string, unknown> = { limit: 100 };
        if (startingAfter) params.starting_after = startingAfter;
        const charges = await stripe.charges.list(params as any);

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
      console.error("Failed to fetch Stripe charges:", err);
      // Fallback: estimate from profiles if Stripe charge fetch fails
    }

    // Previous month MRR for growth calc
    // Use profiles that existed last month + their Stripe amounts
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    let lastMonthMRR = 0;
    activeProfiles.forEach(profile => {
      const createdDate = new Date(profile.created_at);
      if (createdDate <= lastMonth) {
        const sub = subAmounts.get(profile.id);
        if (sub) {
          lastMonthMRR += sub.interval === 'year' ? sub.amount / 12 : sub.amount;
        }
      }
    });

    const mrrGrowth = lastMonthMRR > 0 ? ((totalMRR - lastMonthMRR) / lastMonthMRR) * 100 : 0;

    // MRR/ARR trend (last 6 months)
    // For historical months, we approximate using current amounts for subscribers that existed then
    const mrrTrend: { month: string; mrr: number; arr: number; subscribers: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date();
      monthDate.setMonth(monthDate.getMonth() - i);
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

      let monthMRR = 0;
      let subs = 0;

      profiles.forEach(profile => {
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
      });

      mrrTrend.push({
        month: monthDate.toLocaleDateString('en-US', { month: 'short' }),
        mrr: Math.round(monthMRR),
        arr: Math.round(monthMRR * 12),
        subscribers: subs,
      });
    }

    // Health metrics
    const pastDue = profiles.filter(p => p.subscription_status === 'past_due').length;
    const canceled = profiles.filter(p => p.subscription_status === 'canceled').length;
    const churnRate = profiles.length > 0 ? (canceled / profiles.length) * 100 : 0;

    return NextResponse.json({
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
    });
  } catch (error) {
    console.error("Revenue API error:", error);
    return NextResponse.json(
      { error: "Failed to load revenue data" },
      { status: 500 }
    );
  }
}
