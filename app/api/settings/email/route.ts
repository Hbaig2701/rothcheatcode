import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { changeEmailSchema } from "@/lib/validations/settings";

export const dynamic = "force-dynamic";

// PUT /api/settings/email - Change email (sends verification)
export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = changeEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Supabase will send a confirmation email to the new address
  const { error: updateError } = await supabase.auth.updateUser({
    email: parsed.data.new_email,
  });

  if (updateError) {
    console.error("Error updating email:", updateError);
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "A verification email has been sent to your new address.",
  });
}
