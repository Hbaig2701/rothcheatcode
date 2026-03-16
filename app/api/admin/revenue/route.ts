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

    // Get all advisor profiles with subscription data (exclude test accounts)
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email, plan, subscription_status, billing_cycle, created_at, current_period_end")
      .eq("role", "advisor")
      .not('email', 'in', `(${TEST_EMAILS.join(',')})`);

    if (!profiles) {
      return NextResponse.json({ error: "Failed to fetch profiles" }, { status: 500 });
    }

    // Calculate current MRR and active subscriptions
    let totalMRR = 0;
    let totalARR = 0;
    let activeSubscriptions = 0;
    const revenueByPlan = new Map<string, { monthly: number; annual: number; count: number }>();

    profiles.forEach(profile => {
      // Only count active and trialing subscriptions
      if (profile.subscription_status === 'active' || profile.subscription_status === 'trialing') {
        activeSubscriptions++;

        const plan = profile.plan as keyof typeof PLAN_PRICES;
        const cycle = profile.billing_cycle as 'monthly' | 'annual';

        if (plan && PLAN_PRICES[plan] && cycle) {
          const price = PLAN_PRICES[plan][cycle].amount;

          // Add to MRR (convert annual to monthly)
          const monthlyRevenue = cycle === 'monthly' ? price : price / 12;
          totalMRR += monthlyRevenue;
          totalARR += monthlyRevenue * 12;

          // Track by plan
          const existing = revenueByPlan.get(plan) || { monthly: 0, annual: 0, count: 0 };
          if (cycle === 'monthly') {
            existing.monthly += price;
          } else {
            existing.annual += price;
          }
          existing.count++;
          revenueByPlan.set(plan, existing);
        }
      }
    });

    // Calculate previous month's MRR for growth
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const profilesLastMonth = profiles.filter(p => {
      const createdDate = new Date(p.created_at);
      return createdDate <= lastMonth && (p.subscription_status === 'active' || p.subscription_status === 'trialing');
    });

    let lastMonthMRR = 0;
    profilesLastMonth.forEach(profile => {
      const plan = profile.plan as keyof typeof PLAN_PRICES;
      const cycle = profile.billing_cycle as 'monthly' | 'annual';
      if (plan && PLAN_PRICES[plan] && cycle) {
        const price = PLAN_PRICES[plan][cycle].amount;
        lastMonthMRR += cycle === 'monthly' ? price : price / 12;
      }
    });

    const mrrGrowth = lastMonthMRR > 0 ? ((totalMRR - lastMonthMRR) / lastMonthMRR) * 100 : 0;
    const subscriptionGrowth = profilesLastMonth.length > 0
      ? ((activeSubscriptions - profilesLastMonth.length) / profilesLastMonth.length) * 100
      : 0;

    // Generate monthly revenue trend (last 6 months)
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date();
      monthDate.setMonth(monthDate.getMonth() - i);
      const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

      const profilesInMonth = profiles.filter(p => {
        const created = new Date(p.created_at);
        return created <= monthEnd && (p.subscription_status === 'active' || p.subscription_status === 'trialing');
      });

      let monthMRR = 0;
      let newSubs = 0;
      let churned = 0;

      profilesInMonth.forEach(profile => {
        const plan = profile.plan as keyof typeof PLAN_PRICES;
        const cycle = profile.billing_cycle as 'monthly' | 'annual';
        if (plan && PLAN_PRICES[plan] && cycle) {
          const price = PLAN_PRICES[plan][cycle].amount;
          monthMRR += cycle === 'monthly' ? price : price / 12;

          const created = new Date(profile.created_at);
          if (created >= monthStart && created <= monthEnd) {
            newSubs++;
          }
        }
      });

      // Count churned (canceled in this month)
      const canceledInMonth = profiles.filter(p => {
        if (p.subscription_status !== 'canceled') return false;
        const periodEnd = p.current_period_end ? new Date(p.current_period_end) : null;
        return periodEnd && periodEnd >= monthStart && periodEnd <= monthEnd;
      });
      churned = canceledInMonth.length;

      monthlyTrend.push({
        month: monthDate.toLocaleDateString('en-US', { month: 'short' }),
        mrr: Math.round(monthMRR),
        newSubs,
        churned,
      });
    }

    // Trial metrics
    const trials = profiles.filter(p => p.subscription_status === 'trialing');
    const converted = profiles.filter(p =>
      (p.subscription_status === 'active' || p.subscription_status === 'canceled') &&
      p.plan !== 'none'
    );
    const conversionRate = profiles.length > 0 ? (converted.length / profiles.length) * 100 : 0;

    // Simple avg days to convert (this is approximate - would need more data for accuracy)
    const avgDaysToConvert = 7; // Placeholder - would need trial start/conversion tracking

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
      },
      growth: {
        mrrGrowth: Math.round(mrrGrowth * 10) / 10,
        subscriptionGrowth: Math.round(subscriptionGrowth * 10) / 10,
      },
      byPlan: Array.from(revenueByPlan.entries()).map(([plan, data]) => ({
        plan,
        monthlyRevenue: data.monthly,
        annualRevenue: data.annual,
        count: data.count,
      })),
      byMonth: monthlyTrend,
      trials: {
        active: trials.length,
        converted: converted.length,
        conversionRate: Math.round(conversionRate * 10) / 10,
        avgDaysToConvert,
      },
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
