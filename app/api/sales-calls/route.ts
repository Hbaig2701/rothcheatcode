import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectivePlan } from "@/lib/usage";
import { salesCallTranscriptSchema } from "@/lib/validations/sales-call";
import { transcribeAudio } from "@/lib/sales-calls/transcribe";
import { analyzeTranscript } from "@/lib/sales-calls/analysis";

export const dynamic = "force-dynamic";

const ALLOWED_AUDIO_TYPES = [
  "video/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/webm",
  "video/webm",
];

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

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

  const contentType = request.headers.get("content-type") || "";
  const isFormData = contentType.includes("multipart/form-data");

  if (isFormData) {
    return handleFileUpload(request, user.id);
  } else {
    return handleTranscriptPaste(request, user.id);
  }
}

async function handleTranscriptPaste(request: NextRequest, userId: string) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

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

async function handleFileUpload(request: NextRequest, userId: string) {
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_AUDIO_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "File must be MP4, MP3, WAV, M4A, or WebM" },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File must be under 25MB" },
      { status: 400 }
    );
  }

  const title = (formData.get("title") as string) || `Sales Call - ${new Date().toLocaleDateString("en-US")}`;
  const callDate = (formData.get("call_date") as string) || new Date().toISOString();
  const notes = (formData.get("notes") as string) || null;

  const admin = createAdminClient();

  // Create DB record first
  const { data: record, error: insertError } = await admin
    .from("sales_calls")
    .insert({
      user_id: userId,
      title,
      status: "transcribing",
      call_date: callDate,
      notes,
    })
    .select()
    .single();

  if (insertError || !record) {
    console.error("Error creating sales call:", insertError);
    return NextResponse.json({ error: "Failed to create record" }, { status: 500 });
  }

  // Read file buffer for background processing
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name;
  const mimeType = file.type;

  // Process transcription + analysis in background
  after(async () => {
    const bg = createAdminClient();
    try {
      // Step 1: Transcribe
      const { text, duration } = await transcribeAudio(fileBuffer, fileName, mimeType);

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
    }
  });

  return NextResponse.json(record, { status: 201 });
}
