import { NextRequest, NextResponse } from "next/server";
import { stripe, getSubscriptionPeriodEnd } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const { email, password, sessionId, firstName, lastName } = await request.json();

  if (!email || !password || !sessionId) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters" },
      { status: 400 }
    );
  }


  try {
    // Verify the Stripe session
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });

    if (session.status !== "complete") {
      return NextResponse.json(
        { error: "Payment not complete" },
        { status: 400 }
      );
    }

    if (session.customer_details?.email !== email) {
      return NextResponse.json(
        { error: "Email does not match payment" },
        { status: 400 }
      );
    }

    const stripeCustomerId =
      typeof session.customer === "string"
        ? session.customer
        : session.customer?.id;
    const subscription = session.subscription as Record<string, unknown> | null;
    const plan = session.metadata?.plan ?? "starter";
    const cycle = session.metadata?.cycle ?? "monthly";

    const admin = createAdminClient();

    // Bug 10 fix: Check if this Stripe session has already been used
    if (stripeCustomerId) {
      const { data: existingProfile } = await admin
        .from("profiles")
        .select("id")
        .eq("stripe_customer_id", stripeCustomerId)
        .single();
      if (existingProfile) {
        return NextResponse.json(
          { error: "This payment session has already been used to create an account. Please log in." },
          { status: 409 }
        );
      }
    }

    // Create the Supabase user
    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError) {
      // If user already exists, return appropriate error
      if (authError.message?.includes("already")) {
        return NextResponse.json(
          { error: "An account with this email already exists. Please log in." },
          { status: 409 }
        );
      }
      throw authError;
    }

    // Update their profile with Stripe info
    const periodEndIso = getSubscriptionPeriodEnd(subscription);
    await admin
      .from("profiles")
      .update({
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: subscription?.id,
        plan,
        billing_cycle: cycle,
        subscription_status: "active",
        current_period_end: periodEndIso,
      })
      .eq("id", authData.user.id);

    // Initialize usage tracking
    const now = new Date();
    const periodEnd = periodEndIso
      ? new Date(periodEndIso)
      : new Date(now.getFullYear(), now.getMonth() + 1, 0);

    await admin.from("usage").insert({
      user_id: authData.user.id,
      period_start: now.toISOString().split("T")[0],
      period_end: periodEnd.toISOString().split("T")[0],
      scenario_runs: 0,
      pdf_exports: 0,
    });

    // Save first/last name to user_settings
    if (firstName || lastName) {
      await admin.from("user_settings").upsert({
        user_id: authData.user.id,
        first_name: firstName || null,
        last_name: lastName || null,
      }, { onConflict: "user_id" });
    }

    return NextResponse.json({
      success: true,
      userId: authData.user.id,
      email: authData.user.email,
    });
  } catch (error) {
    console.error("Welcome account creation error:", error);
    return NextResponse.json(
      { error: "Failed to create account" },
      { status: 500 }
    );
  }
}
