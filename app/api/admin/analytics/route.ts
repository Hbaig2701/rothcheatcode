import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

    const [
      settingsResult,
      teamResult,
      clientsResult,
      profilesResult,
      loginResult,
      projectionsResult,
    ] = await Promise.all([
      // User settings for feature adoption
      admin.from("user_settings").select("user_id, company_name, logo_url, primary_color"),
      // Team members
      admin.from("team_members").select("team_owner_id, status"),
      // Clients for product/geo data
      admin.from("clients").select("carrier_name, product_name, state, user_id"),
      // Advisor profiles
      admin
        .from("profiles")
        .select("id, plan, subscription_status, billing_cycle")
        .eq("role", "advisor"),
      // Login log for engagement
      admin.from("login_log").select("user_id"),
      // Projections for scenarios per advisor
      admin.from("projections").select("user_id"),
    ]);

    const settings = settingsResult.data ?? [];
    const teams = teamResult.data ?? [];
    const clients = clientsResult.data ?? [];
    const profiles = profilesResult.data ?? [];
    const logins = loginResult.data ?? [];
    const projections = projectionsResult.data ?? [];

    const totalAdvisors = profiles.length;
    const advisorIds = new Set(profiles.map((p) => p.id));

    // Feature adoption — only count settings belonging to advisors
    const advisorSettings = settings.filter((s) => advisorIds.has(s.user_id));
    const withCompanyName = advisorSettings.filter((s) => s.company_name?.trim()).length;
    const withLogo = advisorSettings.filter((s) => s.logo_url).length;
    const withBranding = advisorSettings.filter((s) => s.primary_color && s.primary_color !== "#d4af37").length;

    // Team adoption
    const ownersWithTeam = new Set(teams.map((t) => t.team_owner_id)).size;
    const totalTeamMembers = teams.length;
    const acceptedTeamMembers = teams.filter((t) => t.status === "accepted").length;

    // Product usage — top carriers
    const carrierCounts = new Map<string, number>();
    clients.forEach((c) => {
      if (c.carrier_name) {
        carrierCounts.set(
          c.carrier_name,
          (carrierCounts.get(c.carrier_name) ?? 0) + 1
        );
      }
    });
    const carriers = Array.from(carrierCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // Geography — top states
    const stateCounts = new Map<string, number>();
    clients.forEach((c) => {
      if (c.state) {
        stateCounts.set(c.state, (stateCounts.get(c.state) ?? 0) + 1);
      }
    });
    const states = Array.from(stateCounts.entries())
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    // Subscriptions
    const planCounts = new Map<string, number>();
    const statusCounts = new Map<string, number>();
    const cycleCounts = new Map<string, number>();
    profiles.forEach((p) => {
      const plan = p.plan ?? "none";
      planCounts.set(plan, (planCounts.get(plan) ?? 0) + 1);
      const status = p.subscription_status ?? "none";
      statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
      if (p.billing_cycle) {
        cycleCounts.set(
          p.billing_cycle,
          (cycleCounts.get(p.billing_cycle) ?? 0) + 1
        );
      }
    });

    const plans = Array.from(planCounts.entries()).map(([plan, count]) => ({
      plan,
      count,
    }));
    const statuses = Array.from(statusCounts.entries()).map(
      ([status, count]) => ({ status, count })
    );
    const cycles = Array.from(cycleCounts.entries()).map(([cycle, count]) => ({
      cycle,
      count,
    }));

    // Engagement
    const clientsByAdvisor = new Map<string, number>();
    clients.forEach((c) => {
      clientsByAdvisor.set(
        c.user_id,
        (clientsByAdvisor.get(c.user_id) ?? 0) + 1
      );
    });
    const avgClientsPerAdvisor =
      totalAdvisors > 0
        ? +(
            Array.from(clientsByAdvisor.values()).reduce((a, b) => a + b, 0) /
            totalAdvisors
          ).toFixed(1)
        : 0;

    const scenariosByAdvisor = new Map<string, number>();
    projections.forEach((p) => {
      scenariosByAdvisor.set(
        p.user_id,
        (scenariosByAdvisor.get(p.user_id) ?? 0) + 1
      );
    });
    const avgScenariosPerAdvisor =
      totalAdvisors > 0
        ? +(
            Array.from(scenariosByAdvisor.values()).reduce(
              (a, b) => a + b,
              0
            ) / totalAdvisors
          ).toFixed(1)
        : 0;

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
      productUsage: { carriers },
      geography: { states },
      subscriptions: { plans, statuses, cycles },
      engagement: { avgClientsPerAdvisor, avgScenariosPerAdvisor },
    });
  } catch (error) {
    console.error("Analytics API error:", error);
    return NextResponse.json(
      { error: "Failed to load analytics" },
      { status: 500 }
    );
  }
}
