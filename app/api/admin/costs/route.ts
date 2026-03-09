import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Estimated cost constants
const COST_PER_PDF = 0.003;
const COST_PER_SCENARIO = 0.001;
const COST_PER_GB_STORAGE = 0.021;

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
    const now = new Date();

    // Build month boundaries for last 6 months
    const months: { label: string; start: string; end: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      months.push({
        label: d.toLocaleDateString("en-US", {
          month: "short",
          year: "2-digit",
        }),
        start: d.toISOString(),
        end: end.toISOString(),
      });
    }

    const thisMonthStart = months[months.length - 1].start;
    const lastMonthStart = months[months.length - 2].start;
    const lastMonthEnd = months[months.length - 2].end;

    const [
      exportsAll,
      scenariosAll,
      exportsThisMonth,
      exportsLastMonth,
      scenariosThisMonth,
      scenariosLastMonth,
      calcLogResult,
      storageResult,
    ] = await Promise.all([
      // All exports with dates for by-month grouping
      admin
        .from("export_log")
        .select("created_at")
        .gte("created_at", months[0].start),
      // All scenarios with dates
      admin
        .from("projections")
        .select("created_at")
        .gte("created_at", months[0].start),
      // This month counts
      admin
        .from("export_log")
        .select("id", { count: "exact", head: true })
        .gte("created_at", thisMonthStart),
      // Last month counts
      admin
        .from("export_log")
        .select("id", { count: "exact", head: true })
        .gte("created_at", lastMonthStart)
        .lt("created_at", lastMonthEnd),
      admin
        .from("projections")
        .select("id", { count: "exact", head: true })
        .gte("created_at", thisMonthStart),
      admin
        .from("projections")
        .select("id", { count: "exact", head: true })
        .gte("created_at", lastMonthStart)
        .lt("created_at", lastMonthEnd),
      // Avg calc time this month
      admin
        .from("calculation_log")
        .select("calculation_ms")
        .gte("created_at", thisMonthStart),
      // Storage estimate: count logos/avatars
      admin
        .from("user_settings")
        .select("logo_url, avatar_url"),
    ]);

    // Group exports/scenarios by month
    const exportsByMonth = months.map((m) => ({
      month: m.label,
      count:
        exportsAll.data?.filter(
          (e) => e.created_at >= m.start && e.created_at < m.end
        ).length ?? 0,
    }));

    const scenariosByMonth = months.map((m) => ({
      month: m.label,
      count:
        scenariosAll.data?.filter(
          (e) => e.created_at >= m.start && e.created_at < m.end
        ).length ?? 0,
    }));

    // Calc average
    const calcTimes =
      calcLogResult.data?.map((c) => c.calculation_ms).filter(Boolean) ?? [];
    const avgCalcMs =
      calcTimes.length > 0
        ? Math.round(calcTimes.reduce((a, b) => a + b, 0) / calcTimes.length)
        : 0;

    // Storage estimate (rough: 500KB avg per image)
    const imageCount =
      (storageResult.data?.filter((s) => s.logo_url).length ?? 0) +
      (storageResult.data?.filter((s) => s.avatar_url).length ?? 0);
    const estimatedStorageMB = Math.round(imageCount * 0.5);

    const pdfThisMonth = exportsThisMonth.count ?? 0;
    const pdfLastMonth = exportsLastMonth.count ?? 0;
    const scenarioThisMonth = scenariosThisMonth.count ?? 0;
    const scenarioLastMonth = scenariosLastMonth.count ?? 0;

    const pdfTrend =
      pdfLastMonth > 0
        ? Math.round(((pdfThisMonth - pdfLastMonth) / pdfLastMonth) * 100)
        : 0;
    const scenarioTrend =
      scenarioLastMonth > 0
        ? Math.round(
            ((scenarioThisMonth - scenarioLastMonth) / scenarioLastMonth) * 100
          )
        : 0;

    // Cost estimates
    const pdfCost = +(pdfThisMonth * COST_PER_PDF).toFixed(2);
    const scenarioCost = +(scenarioThisMonth * COST_PER_SCENARIO).toFixed(2);
    const storageCost = +((estimatedStorageMB / 1024) * COST_PER_GB_STORAGE).toFixed(4);
    const totalCost = +(pdfCost + scenarioCost + storageCost).toFixed(2);

    // Alerts
    const alerts = {
      pdfSpike: pdfLastMonth > 0 && pdfThisMonth > pdfLastMonth * 2,
      scenarioSpike:
        scenarioLastMonth > 0 && scenarioThisMonth > scenarioLastMonth * 2,
      highCalcTime: avgCalcMs > 5000,
    };

    return NextResponse.json({
      pdfExports: {
        thisMonth: pdfThisMonth,
        lastMonth: pdfLastMonth,
        trend: pdfTrend,
        byMonth: exportsByMonth,
      },
      scenarioRuns: {
        thisMonth: scenarioThisMonth,
        lastMonth: scenarioLastMonth,
        trend: scenarioTrend,
        byMonth: scenariosByMonth,
      },
      computation: { avgCalcMs },
      storage: { estimatedMB: estimatedStorageMB, imageCount },
      costEstimates: {
        pdf: pdfCost,
        scenario: scenarioCost,
        storage: storageCost,
        total: totalCost,
      },
      alerts,
    });
  } catch (error) {
    console.error("Costs API error:", error);
    return NextResponse.json(
      { error: "Failed to load costs" },
      { status: 500 }
    );
  }
}
