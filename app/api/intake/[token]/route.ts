import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { intakeFormSchema, intakeToClientData } from "@/lib/validations/intake";
import { checkClientLimit } from "@/lib/usage";
import { createNotification } from "@/lib/notifications/create";
import { sendIntakeCompletedEmail } from "@/lib/notifications/email";

// GET /api/intake/[token] - Validate an intake link
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: link, error } = await admin
    .from("intake_links")
    .select("status, expires_at, user_id")
    .eq("token", token)
    .single();

  if (error || !link) {
    return NextResponse.json(
      { error: "Invalid questionnaire link" },
      { status: 404 }
    );
  }

  if (link.status === "completed") {
    return NextResponse.json(
      { error: "This questionnaire has already been submitted" },
      { status: 410 }
    );
  }

  if (new Date(link.expires_at) < new Date()) {
    return NextResponse.json(
      { error: "This questionnaire link has expired" },
      { status: 410 }
    );
  }

  // Fetch advisor branding for white-labeling
  const { data: settings } = await admin
    .from("user_settings")
    .select("logo_url, company_name")
    .eq("user_id", link.user_id)
    .single();

  return NextResponse.json({
    status: "valid",
    branding: {
      logoUrl: settings?.logo_url ?? null,
      companyName: settings?.company_name ?? null,
    },
  });
}

// POST /api/intake/[token] - Submit intake form and create client
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const admin = createAdminClient();

  // Look up and validate the intake link
  const { data: link, error: linkError } = await admin
    .from("intake_links")
    .select("id, user_id, status, expires_at")
    .eq("token", token)
    .single();

  if (linkError || !link) {
    return NextResponse.json(
      { error: "Invalid questionnaire link" },
      { status: 404 }
    );
  }

  if (link.status === "completed") {
    return NextResponse.json(
      { error: "This questionnaire has already been submitted" },
      { status: 410 }
    );
  }

  if (new Date(link.expires_at) < new Date()) {
    return NextResponse.json(
      { error: "This questionnaire link has expired" },
      { status: 410 }
    );
  }

  // Re-check the advisor's client limit
  const clientLimit = await checkClientLimit(link.user_id);
  if (!clientLimit.allowed) {
    return NextResponse.json(
      {
        error:
          "Your advisor has reached their client limit. Please contact them directly.",
      },
      { status: 403 }
    );
  }

  // Parse and validate form body
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const parsed = intakeFormSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Convert intake data to full client record with defaults
  const clientData = intakeToClientData(parsed.data);

  // Create client under the advisor's account
  const { data: client, error: clientError } = await admin
    .from("clients")
    .insert({ ...clientData, user_id: link.user_id })
    .select("id")
    .single();

  if (clientError) {
    console.error("Error creating client from intake:", clientError.message, clientError.details, clientError.hint);
    return NextResponse.json(
      { error: "Failed to save your information. Please try again." },
      { status: 500 }
    );
  }

  // Mark intake link as completed
  await admin
    .from("intake_links")
    .update({ status: "completed", client_id: client.id })
    .eq("id", link.id);

  // Notify the advisor that their client finished the questionnaire and is
  // now in their account. Best-effort — never block the submission response.
  await createNotification({
    user_id: link.user_id as string,
    type: 'intake_completed',
    title: 'New client from questionnaire',
    body: clientData.name ? `${clientData.name} just submitted their info` : 'A client just submitted their information',
    link_url: `/clients/${client.id}`,
    related_id: client.id,
  });

  // Email the advisor too — they don't always have the app open, and
  // intake completion is the high-signal moment they care about most
  // (the client they were waiting on just delivered the data).
  // Best-effort — never block the submission response on email failure.
  try {
    const [profileRes, settingsRes] = await Promise.all([
      admin.from("profiles").select("email").eq("id", link.user_id).maybeSingle(),
      admin.from("user_settings").select("first_name").eq("user_id", link.user_id).maybeSingle(),
    ]);
    const advisorEmail = profileRes.data?.email as string | undefined;
    if (advisorEmail) {
      await sendIntakeCompletedEmail({
        to: advisorEmail,
        firstName: (settingsRes.data?.first_name as string | undefined) ?? null,
        clientId: client.id,
        clientName: clientData.name ?? null,
      });
    } else {
      console.warn("[intake] No email on file for advisor — skipped intake email", { advisor_id: link.user_id });
    }
  } catch (err) {
    console.error("[intake] Email send error (non-fatal)", err);
  }

  return NextResponse.json(
    { message: "Your information has been submitted successfully." },
    { status: 201 }
  );
}
