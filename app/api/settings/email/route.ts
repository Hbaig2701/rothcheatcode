import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
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

  const newEmail = parsed.data.new_email;

  // Supabase will send a confirmation email to the new address
  const { error: updateError } = await supabase.auth.updateUser({
    email: newEmail,
  });

  if (updateError) {
    console.error("Error updating email:", updateError);
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  // Bug 7 fix: Also update profiles table and Stripe customer email
  const admin = createAdminClient();

  // Update profiles table
  await admin
    .from("profiles")
    .update({ email: newEmail })
    .eq("id", user.id);

  // Update Stripe customer email if they have one
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (profile?.stripe_customer_id) {
    try {
      await stripe.customers.update(profile.stripe_customer_id, {
        email: newEmail,
      });
    } catch (stripeErr) {
      console.error("Failed to update Stripe customer email:", stripeErr);
      // Don't fail the request — auth email was already updated
    }
  }

  return NextResponse.json({
    success: true,
    message: "A verification email has been sent to your new address.",
  });
}
