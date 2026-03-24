import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectivePlan } from "@/lib/usage";
import { analyzeTranscript } from "@/lib/sales-calls/analysis";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
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

  // Fetch the call and verify it has a transcript
  const { data: call, error: fetchError } = await supabase
    .from("sales_calls")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !call) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!call.transcript_text) {
    return NextResponse.json({ error: "No transcript available to analyze" }, { status: 400 });
  }

  // Update status immediately
  const admin = createAdminClient();
  await admin
    .from("sales_calls")
    .update({ status: "analyzing", updated_at: new Date().toISOString() })
    .eq("id", id);

  // Run analysis in background
  const transcript = call.transcript_text as string;
  after(async () => {
    const bg = createAdminClient();
    try {
      const results = await analyzeTranscript(transcript);
      await bg
        .from("sales_calls")
        .update({
          status: "complete",
          analysis_results: results,
          overall_score: results.score,
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
    } catch (err) {
      console.error("Re-analysis failed for sales call:", id, err);
      await bg
        .from("sales_calls")
        .update({
          status: "failed",
          error_message: err instanceof Error ? err.message : "Re-analysis failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
    }
  });

  return NextResponse.json({ ...call, status: "analyzing" });
}
