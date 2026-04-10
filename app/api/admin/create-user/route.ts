import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/create-user
 * Manually create a user account and link to existing Stripe subscription.
 * Admin-only endpoint.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { email, password, stripeCustomerId, stripeSubscriptionId, plan, billingCycle, firstName, lastName } =
    await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: "email and password required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Create auth user via admin API (handles identities, schema, etc.)
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  const userId = authData.user.id;

  // Update profile with Stripe info
  if (stripeCustomerId) {
    await admin
      .from("profiles")
      .update({
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId || null,
        plan: plan || "standard",
        billing_cycle: billingCycle || "monthly",
        subscription_status: "active",
      })
      .eq("id", userId);
  }

  // Initialize usage
  const now = new Date();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
  await admin.from("usage").insert({
    user_id: userId,
    period_start: now.toISOString().split("T")[0],
    period_end: periodEnd.toISOString().split("T")[0],
    scenario_runs: 0,
    pdf_exports: 0,
  });

  // Save name
  if (firstName || lastName) {
    await admin.from("user_settings").upsert(
      { user_id: userId, first_name: firstName || null, last_name: lastName || null },
      { onConflict: "user_id" }
    );
  }

  return NextResponse.json({ success: true, userId, email });
}
