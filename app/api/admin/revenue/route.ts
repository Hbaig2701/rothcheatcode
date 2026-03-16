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
      .select("id, email, plan, subscription_status, billing_cycle, created_at, current_period_end, stripe_customer_id, stripe_subscription_id")
      .eq("role", "advisor")
      .not('email', 'in', `(${TEST_EMAILS.join(',')})`);

    if (!profiles) {
      return NextResponse.json({ error: "Failed to fetch profiles" }, { status: 500 });
    }

    // Separate paying users (have Stripe subscription) from trial users (no Stripe data)
    const hasStripe = (p: typeof profiles[0]) => !!(p.stripe_customer_id || p.stripe_subscription_id);
    const payingProfiles = profiles.filter(hasStripe);
    const trialProfiles = profiles.filter(p => !hasStripe(p));

    // Calculate current MRR and active subscriptions (only actual Stripe subscribers)
    let totalMRR = 0;
    let totalARR = 0;
    let activeSubscriptions = 0;
    const revenueByPlan = new Map<string, { monthly: number; annual: number; count: number }>();

    payingProfiles.forEach(profile => {
      // Only count active subscriptions for revenue
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

    // Calculate previous month's MRR for growth (only Stripe subscribers)
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const payingLastMonth = payingProfiles.filter(p => {
      const createdDate = new Date(p.created_at);
      return createdDate <= lastMonth && (p.subscription_status === 'active' || p.subscription_status === 'trialing');
    });

    let lastMonthMRR = 0;
    payingLastMonth.forEach(profile => {
      const plan = profile.plan as keyof typeof PLAN_PRICES;
      const cycle = profile.billing_cycle as 'monthly' | 'annual';
      if (plan && PLAN_PRICES[plan] && cycle) {
        const price = PLAN_PRICES[plan][cycle].amount;
        lastMonthMRR += cycle === 'monthly' ? price : price / 12;
      }
    });

    const mrrGrowth = lastMonthMRR > 0 ? ((totalMRR - lastMonthMRR) / lastMonthMRR) * 100 : 0;
    const subscriptionGrowth = payingLastMonth.length > 0
      ? ((activeSubscriptions - payingLastMonth.length) / payingLastMonth.length) * 100
      : 0;

    // Generate monthly revenue trend (last 6 months) - only Stripe subscribers
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date();
      monthDate.setMonth(monthDate.getMonth() - i);
      const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

      const payingInMonth = payingProfiles.filter(p => {
        const created = new Date(p.created_at);
        return created <= monthEnd && (p.subscription_status === 'active' || p.subscription_status === 'trialing');
      });

      let monthMRR = 0;
      let newSubs = 0;
      let churned = 0;

      payingInMonth.forEach(profile => {
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

      // Count churned (canceled Stripe subscribers in this month)
      const canceledInMonth = payingProfiles.filter(p => {
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

    // Trial metrics: trial = no Stripe subscription, converted = has Stripe subscription
    const trialCount = trialProfiles.length;
    const convertedCount = payingProfiles.length;
    const totalEver = profiles.length;
    const conversionRate = totalEver > 0 ? (convertedCount / totalEver) * 100 : 0;

    // Health metrics (only relevant for actual Stripe subscribers)
    const pastDue = payingProfiles.filter(p => p.subscription_status === 'past_due').length;
    const canceled = payingProfiles.filter(p => p.subscription_status === 'canceled').length;
    const churnRate = payingProfiles.length > 0 ? (canceled / payingProfiles.length) * 100 : 0;

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
        active: trialCount,
        converted: convertedCount,
        conversionRate: Math.round(conversionRate * 10) / 10,
        avgDaysToConvert: 0,
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
