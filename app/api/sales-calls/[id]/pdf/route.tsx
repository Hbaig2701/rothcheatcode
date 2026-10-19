import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/usage";
import type { SalesCall } from "@/lib/types/sales-call";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 50) || "call";
}

function validTimeZone(tz: string | null): string | null {
  if (!tz) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

// GET /api/sales-calls/[id]/pdf[?transcript=1][&tz=America/Chicago] — coaching report as a PDF.
export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { plan } = await getEffectivePlan(user.id);
  if (plan === "none") {
    return NextResponse.json({ error: "Subscription required" }, { status: 403 });
  }

  // RLS scopes sales_calls to the owner, same as GET /api/sales-calls/[id].
  const { data: call, error } = await supabase
    .from("sales_calls")
    .select("*")
    .eq("id", id)
    .single<SalesCall>();
  if (error || !call) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (call.status !== "complete" || !call.analysis_results) {
    return NextResponse.json({ error: "Analysis is not finished yet" }, { status: 409 });
  }

  const { data: settings } = await supabase
    .from("user_settings")
    .select("company_name, primary_color")
    .eq("user_id", user.id)
    .maybeSingle();

  const includeTranscript = request.nextUrl.searchParams.get("transcript") === "1";
  // The browser passes its timezone so dates match what the advisor sees on
  // screen (this function runs in UTC). Fall back if it's missing or invalid.
  const timeZone = validTimeZone(request.nextUrl.searchParams.get("tz")) ?? "America/New_York";

  try {
    // Dynamic import — react-pdf breaks Next's build-time page data collection
    // when imported statically (same as app/api/pdf/[clientId]).
    const { renderToBuffer } = await import("@react-pdf/renderer");
    const { SalesCallPDF } = await import("@/lib/pdf/sales-call-document");
    const buffer = await renderToBuffer(
      <SalesCallPDF
        title={call.title || "Untitled Call"}
        callDate={call.call_date}
        durationSeconds={call.duration_seconds}
        notes={call.notes}
        analysis={call.analysis_results}
        transcript={includeTranscript ? call.transcript_text : null}
        companyName={settings?.company_name}
        primaryColor={settings?.primary_color || "#1e3a5f"}
        generatedAt={new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone })}
        timeZone={timeZone}
      />
    );

    const filename = `sales-call-analysis-${sanitizeFilename(call.title || "call")}.pdf`;
    return new Response(new Uint8Array(buffer) as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (err) {
    console.error("Sales call PDF generation failed:", id, err);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
