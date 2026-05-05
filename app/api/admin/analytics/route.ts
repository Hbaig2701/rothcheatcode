import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

// Test accounts to exclude
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

    // Only get paying advisors
    const { data: payingProfiles } = await admin
      .from("profiles")
      .select("id, email, created_at, subscription_status, plan, billing_cycle, stripe_subscription_id")
      .eq("role", "advisor")
      .not('email', 'in', `(${TEST_EMAILS.join(',')})`)
      .not('stripe_customer_id', 'is', null);

    const profiles = payingProfiles ?? [];
    const advisorIds = profiles.map(p => p.id);
    const totalAdvisors = profiles.length;

    if (totalAdvisors === 0) {
      return NextResponse.json({
        featureAdoption: {
          totalAdvisors: 0, withCompanyName: 0, withLogo: 0, withBranding: 0,
          withTeamInvites: 0, totalTeamMembers: 0, acceptedTeamMembers: 0,
        },
        engagement: { avgClientsPerAdvisor: 0, avgScenariosPerAdvisor: 0 },
        healthScores: [],
        revenueAtRisk: [],
      });
    }

    const [settingsResult, teamResult, clientsResult, loginsResult, projectionsResult, exportsResult] = await Promise.all([
      admin.from("user_settings").select("user_id, company_name, logo_url, primary_color, first_name, last_name").in("user_id", advisorIds),
      admin.from("team_members").select("team_owner_id, status").in("team_owner_id", advisorIds),
      admin.from("clients").select("user_id").in("user_id", advisorIds),
      admin.from("login_log").select("user_id, created_at").in("user_id", advisorIds).order("created_at", { ascending: false }),
      admin.from("projections").select("user_id, created_at").in("user_id", advisorIds),
      admin.from("export_log").select("user_id, created_at").in("user_id", advisorIds),
    ]);

    const settings = settingsResult.data ?? [];
    const teams = teamResult.data ?? [];
    const clients = clientsResult.data ?? [];
    const logins = loginsResult.data ?? [];
    const projections = projectionsResult.data ?? [];
    const exports = exportsResult.data ?? [];

    // Feature adoption (paying advisors only)
    const advisorIdSet = new Set(advisorIds);
    const advisorSettings = settings.filter(s => advisorIdSet.has(s.user_id));
    const withCompanyName = advisorSettings.filter(s => s.company_name?.trim()).length;
    const withLogo = advisorSettings.filter(s => s.logo_url).length;
    const withBranding = advisorSettings.filter(s => s.primary_color && s.primary_color !== "#d4af37").length;

    const ownersWithTeam = new Set(teams.map(t => t.team_owner_id)).size;
    const totalTeamMembers = teams.length;
    const acceptedTeamMembers = teams.filter(t => t.status === "accepted").length;

    // Engagement
    const clientsByAdvisor = new Map<string, number>();
    clients.forEach(c => clientsByAdvisor.set(c.user_id, (clientsByAdvisor.get(c.user_id) ?? 0) + 1));
    const avgClientsPerAdvisor = totalAdvisors > 0
      ? +(Array.from(clientsByAdvisor.values()).reduce((a, b) => a + b, 0) / totalAdvisors).toFixed(1)
      : 0;

    const scenariosByAdvisor = new Map<string, number>();
    projections.forEach(p => scenariosByAdvisor.set(p.user_id, (scenariosByAdvisor.get(p.user_id) ?? 0) + 1));
    const avgScenariosPerAdvisor = totalAdvisors > 0
      ? +(Array.from(scenariosByAdvisor.values()).reduce((a, b) => a + b, 0) / totalAdvisors).toFixed(1)
      : 0;

    // Names map
    const nameMap = new Map<string, string>();
    settings.forEach(s => {
      const parts = [s.first_name, s.last_name].filter(Boolean);
      if (parts.length > 0) nameMap.set(s.user_id, parts.join(' '));
    });

    // Build per-advisor activity data for health scores and risk
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

    // Last login per advisor
    const lastLoginMap = new Map<string, Date>();
    logins.forEach(l => {
      if (!lastLoginMap.has(l.user_id)) {
        lastLoginMap.set(l.user_id, new Date(l.created_at));
      }
    });

    // Logins in last 30 days per advisor
    const recentLoginCounts = new Map<string, number>();
    logins.forEach(l => {
      if (new Date(l.created_at) >= thirtyDaysAgo) {
        recentLoginCounts.set(l.user_id, (recentLoginCounts.get(l.user_id) ?? 0) + 1);
      }
    });

    // Scenarios in last 30 days
    const recentScenarioCounts = new Map<string, number>();
    projections.forEach(p => {
      if (new Date(p.created_at) >= thirtyDaysAgo) {
        recentScenarioCounts.set(p.user_id, (recentScenarioCounts.get(p.user_id) ?? 0) + 1);
      }
    });

    // Exports in last 30 days
    const recentExportCounts = new Map<string, number>();
    exports.forEach(e => {
      if (new Date(e.created_at) >= thirtyDaysAgo) {
        recentExportCounts.set(e.user_id, (recentExportCounts.get(e.user_id) ?? 0) + 1);
      }
    });

    // Build raw health scores first (no MRR yet).
    const rawHealth = profiles
      .filter(p => p.subscription_status === 'active' || p.subscription_status === 'trialing')
      .map(p => {
        const lastLogin = lastLoginMap.get(p.id);
        const daysSinceLogin = lastLogin
          ? Math.floor((now.getTime() - lastLogin.getTime()) / 86400000)
          : 999;

        const recentLogins = recentLoginCounts.get(p.id) ?? 0;
        const recentScenarios = recentScenarioCounts.get(p.id) ?? 0;
        const recentExports = recentExportCounts.get(p.id) ?? 0;
        const totalClients = clientsByAdvisor.get(p.id) ?? 0;

        // Score components (each 0-25, total 0-100)
        const recencyScore = daysSinceLogin <= 3 ? 25 : daysSinceLogin <= 7 ? 20 : daysSinceLogin <= 14 ? 12 : daysSinceLogin <= 30 ? 5 : 0;
        const frequencyScore = Math.min(25, Math.round((recentLogins / 10) * 25));
        const usageScore = Math.min(25, Math.round(((recentScenarios + recentExports) / 5) * 25));
        const depthScore = Math.min(25, Math.round((totalClients / 5) * 25));

        const score = recencyScore + frequencyScore + usageScore + depthScore;

        return {
          id: p.id,
          email: p.email,
          name: nameMap.get(p.id) ?? null,
          score,
          daysSinceLogin,
          recentLogins,
          recentScenarios,
          recentExports,
          totalClients,
          stripe_subscription_id: p.stripe_subscription_id,
        };
      });

    // Fetch MRR from Stripe for the bottom-of-health subset that we'll display
    // (everyone scoring below 75). Cap fetches so we don't pay the round-trip
    // for advisors that won't appear in the merged "Advisor Health" list.
    const stripe = getStripe();
    const mrrFetchTargets = rawHealth
      .filter(h => h.score < 75 && h.stripe_subscription_id)
      .sort((a, b) => a.score - b.score)
      .slice(0, 30);
    const subAmountMap = new Map<string, number>();

    const subFetches = mrrFetchTargets.map(async (h) => {
      try {
        // Latest invoice carries the post-discount billed amount; cleanest
        // single source of truth for MRR after discounts.
        const sub = await stripe.subscriptions.retrieve(h.stripe_subscription_id!, {
          expand: ['latest_invoice'],
        });
        const item = sub.items?.data?.[0];
        if (!item) return;
        const listPrice = (item.price?.unit_amount ?? 0) / 100;
        const interval = item.price?.recurring?.interval ?? 'month';

        let amount = listPrice;
        const latestInvoice = (sub as unknown as { latest_invoice?: { total?: number; amount_paid?: number } | string | null }).latest_invoice;
        if (latestInvoice && typeof latestInvoice === 'object') {
          const tot = latestInvoice.total ?? 0;
          const paid = latestInvoice.amount_paid ?? 0;
          if (tot > 0) amount = tot / 100;
          else if (paid > 0) amount = paid / 100;
        }

        const mrr = interval === 'year' ? Math.round(amount / 12) : Math.round(amount);
        subAmountMap.set(h.id, mrr);
      } catch {
        // Skip if fetch fails
      }
    });
    await Promise.all(subFetches);

    // Final shape: each advisor carries MRR + risk label. Sorted by score
    // ascending so the highest-priority intervention sits at the top.
    const healthScores = rawHealth
      .map(({ stripe_subscription_id: _drop, ...h }) => ({
        ...h,
        mrr: subAmountMap.get(h.id) ?? 0,
        risk: h.score < 25 ? 'critical' as const
          : h.score < 50 ? 'high' as const
          : h.score < 75 ? 'medium' as const
          : 'healthy' as const,
      }))
      .sort((a, b) => a.score - b.score);

    return NextResponse.json({
      featureAdoption: {
        totalAdvisors,
        withCompanyName,
        withLogo,
        withBranding,
        withTeamInvites: ownersWithTeam,
        totalTeamMembers,
        acceptedTeamMembers,
      },
      engagement: { avgClientsPerAdvisor, avgScenariosPerAdvisor },
      healthScores,
    });
  } catch (error) {
    console.error("Analytics API error:", error);
    return NextResponse.json(
      { error: "Failed to load analytics" },
      { status: 500 }
    );
  }
}
