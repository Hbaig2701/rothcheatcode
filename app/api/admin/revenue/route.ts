import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLAN_PRICES } from "@/lib/config/plans";

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

    // Get paying advisor profiles only (have Stripe subscription, exclude test accounts)
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email, plan, subscription_status, billing_cycle, created_at, current_period_end, stripe_customer_id, stripe_subscription_id")
      .eq("role", "advisor")
      .not('email', 'in', `(${TEST_EMAILS.join(',')})`)
      .not('stripe_customer_id', 'is', null);

    if (!profiles) {
      return NextResponse.json({ error: "Failed to fetch profiles" }, { status: 500 });
    }

    // Calculate current MRR and active subscriptions
    let totalMRR = 0;
    let totalARR = 0;
    let activeSubscriptions = 0;
    let monthlyCount = 0;
    let annualCount = 0;
    let monthlyRevenue = 0;
    let annualRevenue = 0;

    profiles.forEach(profile => {
      if (profile.subscription_status === 'active' || profile.subscription_status === 'trialing') {
        activeSubscriptions++;

        const plan = profile.plan as keyof typeof PLAN_PRICES;
        const cycle = profile.billing_cycle as 'monthly' | 'annual';

        if (plan && PLAN_PRICES[plan] && cycle) {
          const price = PLAN_PRICES[plan][cycle].amount;
          const monthly = cycle === 'monthly' ? price : price / 12;
          totalMRR += monthly;
          totalARR += monthly * 12;

          if (cycle === 'monthly') {
            monthlyCount++;
            monthlyRevenue += price;
          } else {
            annualCount++;
            annualRevenue += price;
          }
        }
      }
    });

    // Total cash collected estimate: sum of what each subscriber has paid since signup
    // For monthly: months_active * monthly_price
    // For annual: years_active * annual_price
    let totalCashCollected = 0;
    const now = new Date();
    profiles.forEach(profile => {
      if (profile.subscription_status === 'canceled' || profile.subscription_status === 'active' || profile.subscription_status === 'trialing') {
        const plan = profile.plan as keyof typeof PLAN_PRICES;
        const cycle = profile.billing_cycle as 'monthly' | 'annual';
        if (plan && PLAN_PRICES[plan] && cycle) {
          const price = PLAN_PRICES[plan][cycle].amount;
          const created = new Date(profile.created_at);
          const monthsActive = Math.max(1, Math.ceil((now.getTime() - created.getTime()) / (30.44 * 86400000)));

          if (cycle === 'monthly') {
            totalCashCollected += monthsActive * price;
          } else {
            const yearsActive = Math.max(1, Math.ceil(monthsActive / 12));
            totalCashCollected += yearsActive * price;
          }
        }
      }
    });

    // Previous month MRR for growth calc
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    let lastMonthMRR = 0;
    profiles.forEach(profile => {
      const createdDate = new Date(profile.created_at);
      if (createdDate <= lastMonth && (profile.subscription_status === 'active' || profile.subscription_status === 'trialing')) {
        const plan = profile.plan as keyof typeof PLAN_PRICES;
        const cycle = profile.billing_cycle as 'monthly' | 'annual';
        if (plan && PLAN_PRICES[plan] && cycle) {
          const price = PLAN_PRICES[plan][cycle].amount;
          lastMonthMRR += cycle === 'monthly' ? price : price / 12;
        }
      }
    });

    const mrrGrowth = lastMonthMRR > 0 ? ((totalMRR - lastMonthMRR) / lastMonthMRR) * 100 : 0;

    // Generate MRR/ARR line chart data (last 6 months)
    const mrrTrend: { month: string; mrr: number; arr: number; subscribers: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date();
      monthDate.setMonth(monthDate.getMonth() - i);
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

      let monthMRR = 0;
      let subs = 0;

      profiles.forEach(profile => {
        const created = new Date(profile.created_at);
        if (created <= monthEnd && (profile.subscription_status === 'active' || profile.subscription_status === 'trialing' ||
            (profile.subscription_status === 'canceled' && profile.current_period_end && new Date(profile.current_period_end) >= monthEnd))) {
          const plan = profile.plan as keyof typeof PLAN_PRICES;
          const cycle = profile.billing_cycle as 'monthly' | 'annual';
          if (plan && PLAN_PRICES[plan] && cycle) {
            const price = PLAN_PRICES[plan][cycle].amount;
            monthMRR += cycle === 'monthly' ? price : price / 12;
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
        monthly: { count: monthlyCount, revenue: monthlyRevenue },
        annual: { count: annualCount, revenue: annualRevenue },
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
