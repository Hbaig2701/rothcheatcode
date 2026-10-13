import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createDashboardLink,
  createOnboardingLink,
  ensureConnectAccount,
  syncConnectAccount,
} from "@/lib/affiliates/connect";

// POST /api/affiliate/payouts  { action: "onboard" | "dashboard" }
//
//  onboard   → create the advisor's Stripe Express account (first time) and
//              return a one-time link to Stripe's hosted payout setup, or to
//              finish it if they left partway.
//  dashboard → return a one-time link to their Stripe Express dashboard
//              (bank details, payout history, tax forms).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let action: unknown;
  try {
    action = (await request.json())?.action;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (action !== "onboard" && action !== "dashboard") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: aff } = await admin
    .from("affiliates")
    .select("id, email, stripe_account_id")
    .eq("owner_profile_id", user.id)
    .maybeSingle();
  if (!aff) {
    return NextResponse.json(
      { error: "You're not enrolled in the referral program yet." },
      { status: 404 }
    );
  }

  try {
    if (action === "onboard") {
      const accountId = await ensureConnectAccount(admin, aff);
      return NextResponse.json({ url: await createOnboardingLink(accountId) });
    }

    if (!aff.stripe_account_id) {
      return NextResponse.json({ error: "Set up payouts first." }, { status: 400 });
    }
    const status = await syncConnectAccount(admin, aff.id, aff.stripe_account_id);
    // Express dashboards only exist once onboarding is submitted.
    const url =
      status === "active"
        ? await createDashboardLink(aff.stripe_account_id)
        : await createOnboardingLink(aff.stripe_account_id);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[Affiliate payouts] link error:", err);
    // Surface Stripe's own message — "couldn't reach Stripe" hid the real
    // cause (a platform/Connect setting) the first time this failed in prod.
    const stripeMessage =
      err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : null;
    return NextResponse.json(
      {
        error: stripeMessage
          ? `Stripe couldn't start payout setup: ${stripeMessage}`
          : "Couldn't reach Stripe. Please try again in a moment.",
      },
      { status: 502 }
    );
  }
}
