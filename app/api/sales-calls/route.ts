import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectivePlan } from "@/lib/usage";
import { salesCallTranscriptSchema, salesCallRecordingSchema } from "@/lib/validations/sales-call";
import { transcribeAudio } from "@/lib/sales-calls/transcribe";
import { analyzeTranscript } from "@/lib/sales-calls/analysis";

export const dynamic = "force-dynamic";
// Transcription AND analysis both run inside after(), which shares the route's
// budget. Measured on real uploads: Whisper takes 43s on a 22-minute recording
// and 88s on a 35-minute one, then the analysis takes another 86-92s. At 120
// the function was being killed partway through the analysis — and because a
// hard kill never reaches the catch block, the record sat at "analyzing" with a
// null error_message and the advisor watched a spinner forever (Tamara, 22-min
// call, Oct 16; Josh, 35-min call, Sept 23, stuck for 23 days). 300 leaves room
// for the longest recording the 25MB ceiling allows. STUCK_PROCESSING_MS below
// is the backstop for the case where even this is not enough, since a timed-out
// function can never report its own failure.
export const maxDuration = 300;

// A record left in transcribing/analyzing for longer than this had its function
// killed; nothing is still working on it. Comfortably above maxDuration so a
// genuinely in-flight job is never touched.
const STUCK_PROCESSING_MS = 10 * 60 * 1000;

const SALES_CALLS_BUCKET = "sales-call-uploads";
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB — Whisper's ceiling

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { plan } = await getEffectivePlan(user.id);
  if (plan === "none") {
    return NextResponse.json({ error: "Subscription required" }, { status: 403 });
  }

  // Fail forward any of this advisor's records whose processing died without
  // reporting it. Done on read rather than on a schedule because this is the
  // exact moment it matters: the advisor is looking at the spinner, so the page
  // they load next shows a message they can act on instead of spinning on a job
  // that stopped existing. Scoped to their own rows and to records old enough
  // that nothing can still be running.
  await supabase
    .from("sales_calls")
    .update({
      status: "failed",
      error_message:
        "Processing stopped before the report was finished. This usually means the " +
        "recording was long enough to exceed the processing window — uploading it in " +
        "shorter segments will produce a report. Nothing was charged against your usage.",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .in("status", ["transcribing", "analyzing"])
    .lt("updated_at", new Date(Date.now() - STUCK_PROCESSING_MS).toISOString());

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");

  const { data, error, count } = await supabase
    .from("sales_calls")
    .select("id, title, status, overall_score, call_date, duration_seconds, notes, error_message, created_at", { count: "exact" })
    .order("call_date", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Error fetching sales calls:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ calls: data, total: count });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { plan } = await getEffectivePlan(user.id);
  if (plan === "none") {
    return NextResponse.json({ error: "Subscription required" }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Both flows are JSON now: a recording arrives as a storage path (the
  // browser uploads straight to the bucket), a transcript arrives inline.
  if (typeof body?.storage_path === "string") {
    return handleRecording(body, user.id);
  }
  return handleTranscriptPaste(body, user.id);
}

async function handleTranscriptPaste(body: unknown, userId: string) {
  const parsed = salesCallTranscriptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { transcript_text, title, call_date, notes } = parsed.data;

  const admin = createAdminClient();
  const { data: record, error: insertError } = await admin
    .from("sales_calls")
    .insert({
      user_id: userId,
      title: title || `Sales Call - ${new Date().toLocaleDateString("en-US")}`,
      transcript_text,
      status: "analyzing",
      call_date: call_date || new Date().toISOString(),
      notes: notes || null,
    })
    .select()
    .single();

  if (insertError || !record) {
    console.error("Error creating sales call:", insertError);
    return NextResponse.json({ error: "Failed to create record" }, { status: 500 });
  }

  // Process analysis in background after response is sent
  after(async () => {
    const bg = createAdminClient();
    try {
      const results = await analyzeTranscript(transcript_text);
      await bg
        .from("sales_calls")
        .update({
          status: "complete",
          analysis_results: results,
          overall_score: results.score,
          updated_at: new Date().toISOString(),
        })
        .eq("id", record.id);
    } catch (err) {
      console.error("Analysis failed for sales call:", record.id, err);
      await bg
        .from("sales_calls")
        .update({
          status: "failed",
          error_message: err instanceof Error ? err.message : "Analysis failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", record.id);
    }
  });

  return NextResponse.json(record, { status: 201 });
}

async function handleRecording(body: unknown, userId: string) {
  const parsed = salesCallRecordingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { storage_path: storagePath, title, call_date, notes } = parsed.data;

  // The bucket policy only lets an advisor write under their own uid folder;
  // enforce the same here so a crafted path can't transcribe someone else's file.
  if (!storagePath.startsWith(`${userId}/`) || storagePath.includes("..")) {
    return NextResponse.json({ error: "Invalid storage path" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Confirm the object exists and is within Whisper's limit before creating
  // a record. The bucket's own allowed_mime_types already gated the type.
  const folder = storagePath.slice(0, storagePath.lastIndexOf("/"));
  const objectName = storagePath.slice(storagePath.lastIndexOf("/") + 1);
  const { data: objects, error: listError } = await admin.storage
    .from(SALES_CALLS_BUCKET)
    .list(folder, { search: objectName, limit: 1 });
  const object = objects?.find((o) => o.name === objectName);
  if (listError || !object) {
    return NextResponse.json({ error: "Uploaded file not found" }, { status: 400 });
  }
  const size = (object.metadata as { size?: number } | null)?.size ?? 0;
  if (size > MAX_FILE_SIZE) {
    await admin.storage.from(SALES_CALLS_BUCKET).remove([storagePath]);
    return NextResponse.json({ error: "File must be under 25MB" }, { status: 400 });
  }
  const mimeType = (object.metadata as { mimetype?: string } | null)?.mimetype || "audio/mpeg";

  const { data: record, error: insertError } = await admin
    .from("sales_calls")
    .insert({
      user_id: userId,
      title: title || `Sales Call - ${new Date().toLocaleDateString("en-US")}`,
      status: "transcribing",
      call_date: call_date || new Date().toISOString(),
      notes: notes || null,
    })
    .select()
    .single();

  if (insertError || !record) {
    console.error("Error creating sales call:", insertError);
    return NextResponse.json({ error: "Failed to create record" }, { status: 500 });
  }

  // Download + transcribe + analyze after the response is sent. The recording
  // is removed from the bucket either way — the transcript is what we keep.
  after(async () => {
    const bg = createAdminClient();
    try {
      const { data: blob, error: downloadError } = await bg.storage
        .from(SALES_CALLS_BUCKET)
        .download(storagePath);
      if (downloadError || !blob) {
        throw new Error(downloadError?.message || "Could not read uploaded file");
      }
      const fileBuffer = Buffer.from(await blob.arrayBuffer());

      // Step 1: Transcribe
      const { text, duration } = await transcribeAudio(fileBuffer, objectName, mimeType);

      await bg
        .from("sales_calls")
        .update({
          transcript_text: text,
          duration_seconds: duration || null,
          status: "analyzing",
          updated_at: new Date().toISOString(),
        })
        .eq("id", record.id);

      // Step 2: Analyze
      const results = await analyzeTranscript(text);

      await bg
        .from("sales_calls")
        .update({
          status: "complete",
          analysis_results: results,
          overall_score: results.score,
          updated_at: new Date().toISOString(),
        })
        .eq("id", record.id);
    } catch (err) {
      console.error("Processing failed for sales call:", record.id, err);
      await bg
        .from("sales_calls")
        .update({
          status: "failed",
          error_message: err instanceof Error ? err.message : "Processing failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", record.id);
    } finally {
      await bg.storage.from(SALES_CALLS_BUCKET).remove([storagePath]).catch(() => {});
    }
  });

  return NextResponse.json(record, { status: 201 });
}
