import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createAffiliatePromotionCode,
  getTierConfig,
  type DiscountTier,
} from "@/lib/affiliates/stripe-coupon";
import { PLAN_PRICES } from "@/lib/config/plans";
import { syncConnectAccount, type PayoutAccountStatus } from "@/lib/affiliates/connect";
import { getEarningsSummary } from "@/lib/affiliates/payouts";

// Self-serve affiliate program for logged-in advisors.
//
//  GET   → enrollment status + referral code + live stats (if enrolled)
//  POST  → enroll instantly (find-or-create affiliate + Stripe promo code)
//
// Payout setup (Stripe Connect) lives in /api/affiliate/payouts.
//
// Every self-serve affiliate is created at the standard tier: their referral
// gets 35% off the annual plan forever, and they earn the tier's default
// commission on it. Admins can still bump specific partners to a richer deal
// in the admin panel — this only sets the default for the self-serve path.
const SELF_SERVE_TIER: DiscountTier = 35;

// Headline figure for the pitch: what an advisor earns per referral each year,
// recurring for as long as that referral stays subscribed. Derived from the
// live annual price + tier so it never drifts from what customers actually pay.
// At $2,970/yr annual, 35% off, 30% commission → $579/yr per referral.
function perReferralAnnualCommission(): number {
  const commissionPct = getTierConfig(SELF_SERVE_TIER).defaultCommissionPct;
  const discounted = PLAN_PRICES.standard.annual.amount * (1 - SELF_SERVE_TIER / 100);
  return Math.round(discounted * (commissionPct / 100));
}

type Admin = ReturnType<typeof createAdminClient>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AffiliateRow = any;

// Where a NEW customer signs up — the marketing site, not the app. Existing
// users log in at app.retirementexpert.ai, but referrals land on the public
// site to subscribe, so that's the URL an advisor shares.
function signupUrl(): string {
  return (
    process.env.NEXT_PUBLIC_MARKETING_URL?.replace(/\/$/, "") ??
    "https://retirementexpert.ai"
  );
}

// Build the advisor-facing payload (referral code + economics + live stats)
// for an enrolled affiliate. Mirrors the token-gated portal page so both
// surfaces show the same numbers.
async function buildEnrolledPayload(admin: Admin, aff: AffiliateRow) {
  const { data: statsRows } = await admin.rpc("affiliate_portal_stats", {
    _token: aff.portal_token,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = ((statsRows ?? []) as any[])[0];

  const annualListPrice = PLAN_PRICES.standard.annual.amount;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const codes = ((s?.codes ?? []) as any[]).map((c) => {
    const discountPct = Number(c.discount_pct);
    const commissionPct = Number(c.commission_pct);
    const activeSubscribers = Number(c.active_subscribers ?? 0);
    const discounted = Math.round(annualListPrice * (1 - discountPct / 100));
    const perCustomer = Math.round(discounted * (commissionPct / 100));
    return {
      id: c.id as string,
      code: c.code as string,
      discount_pct: discountPct,
      commission_pct: commissionPct,
      is_active: Boolean(c.is_active),
      active_subscribers: activeSubscribers,
      discounted_annual: discounted,
      annual_commission_per_customer: perCustomer,
      annual_recurring_commission: activeSubscribers * perCustomer,
    };
  });

  // Payout account status. Only ask Stripe while setup is unfinished — once
  // payouts are enabled the cached flag is enough (the monthly payout run
  // re-checks it before every transfer).
  let payoutStatus: PayoutAccountStatus = "not_started";
  if (aff.stripe_account_id) {
    payoutStatus = aff.payouts_enabled ? "active" : "incomplete";
    if (!aff.payouts_enabled) {
      try {
        payoutStatus = await syncConnectAccount(admin, aff.id, aff.stripe_account_id);
      } catch (err) {
        console.error("[Affiliate] Could not sync payout account:", err);
      }
    }
  }
  const earnings = await getEarningsSummary(admin, aff.id);

  const totalRecurringCommission = codes.reduce(
    (acc, c) => acc + c.annual_recurring_commission,
    0
  );

  // The primary code is the one an advisor shares. Prefer the standard tier.
  const primary =
    codes.find((c) => c.discount_pct === SELF_SERVE_TIER) ?? codes[0] ?? null;

  return {
    enrolled: true as const,
    per_referral_annual: perReferralAnnualCommission(),
    referral_discount_pct: SELF_SERVE_TIER,
    referral_commission_pct: getTierConfig(SELF_SERVE_TIER).defaultCommissionPct,
    affiliate: {
      id: aff.id as string,
      name: aff.name as string,
      email: aff.email as string,
      is_active: Boolean(aff.is_active),
      created_at: aff.created_at as string,
    },
    referral_code: primary?.code ?? (aff.code as string),
    signup_url: signupUrl(),
    stats: {
      conversions: Number(s?.conversions ?? 0),
      active_annual: Number(s?.active_annual ?? 0),
      abandoned_count: Number(s?.abandoned_count ?? 0),
      recent_conversions: s?.recent_conversions ?? [],
    },
    codes,
    totals: {
      active_subscribers: Number(s?.active_annual ?? 0),
      annual_recurring_commission: totalRecurringCommission,
    },
    payouts: {
      status: payoutStatus,
      ...earnings,
    },
  };
}

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// GET /api/affiliate/me
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: aff } = await admin
    .from("affiliates")
    .select("*")
    .eq("owner_profile_id", user.id)
    .maybeSingle();

  if (!aff) {
    return NextResponse.json({
      enrolled: false,
      per_referral_annual: perReferralAnnualCommission(),
      referral_discount_pct: SELF_SERVE_TIER,
      referral_commission_pct: getTierConfig(SELF_SERVE_TIER).defaultCommissionPct,
    });
  }
  return NextResponse.json(await buildEnrolledPayload(admin, aff));
}

// Turn an advisor's name/email into a code base like "JANE" or "SMITHCO".
function deriveCodeBase(
  firstName: string | null,
  companyName: string | null,
  email: string
): string {
  const source =
    (firstName && firstName.trim()) ||
    (companyName && companyName.trim()) ||
    email.split("@")[0] ||
    "PARTNER";
  const cleaned = source.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const base = cleaned.slice(0, 12);
  return base.length >= 2 ? base : "PARTNER";
}

// POST /api/affiliate/me — enroll the current advisor. Idempotent: if they
// already have an affiliate record (self-created, or one an admin already set
// up under their email) we return it instead of creating a duplicate.
export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Already enrolled?
  const { data: existing } = await admin
    .from("affiliates")
    .select("*")
    .eq("owner_profile_id", user.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(await buildEnrolledPayload(admin, existing));
  }

  // If an admin already created an affiliate under this advisor's email but
  // never linked it to a profile, adopt it rather than making a second one.
  if (user.email) {
    const { data: orphan } = await admin
      .from("affiliates")
      .select("*")
      .eq("email", user.email)
      .is("owner_profile_id", null)
      .maybeSingle();
    if (orphan) {
      const { data: adopted } = await admin
        .from("affiliates")
        .update({ owner_profile_id: user.id })
        .eq("id", orphan.id)
        .select()
        .single();
      return NextResponse.json(await buildEnrolledPayload(admin, adopted ?? orphan));
    }
  }

  // Fresh enrollment.
  const { data: profile } = await admin
    .from("profiles")
    .select("first_name, last_name, company_name")
    .eq("id", user.id)
    .maybeSingle();

  const email = user.email ?? "";
  if (!email) {
    return NextResponse.json(
      { error: "Your account has no email on file, which we need to enroll you." },
      { status: 400 }
    );
  }

  const displayName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
    (profile?.company_name ?? "").trim() ||
    email.split("@")[0];

  const base = deriveCodeBase(
    profile?.first_name ?? null,
    profile?.company_name ?? null,
    email
  );

  // Candidate codes, in order. First the clean "BASE20"; then salted variants
  // from the user id in case the clean one is taken (two advisors named Jane).
  const tier = SELF_SERVE_TIER;
  const salt = user.id.replace(/-/g, "").toUpperCase();
  const candidates = [
    `${base}${tier}`,
    `${base}${tier}${salt.slice(0, 2)}`,
    `${base}${tier}${salt.slice(2, 4)}`,
    `${base}${tier}${salt.slice(4, 6)}`,
    `${base}${salt.slice(0, 4)}`,
  ];

  // Skip candidates already present in our DB before spending a Stripe call.
  const { data: takenRows } = await admin
    .from("affiliate_codes")
    .select("code")
    .in("code", candidates);
  const taken = new Set(
    ((takenRows ?? []) as Array<{ code: string }>).map((r) => r.code)
  );

  let created: { promotion_code_id: string; coupon_id: string } | null = null;
  let chosenCode = "";
  for (const candidate of candidates) {
    if (taken.has(candidate)) continue;
    try {
      created = await createAffiliatePromotionCode(candidate, tier);
      chosenCode = candidate;
      break;
    } catch {
      // Stripe rejects duplicate promo codes across the whole account (a code
      // an admin made outside our DB). Try the next salted candidate.
      continue;
    }
  }

  if (!created) {
    return NextResponse.json(
      { error: "Could not generate a unique referral code. Please try again." },
      { status: 500 }
    );
  }

  const commissionPct = getTierConfig(tier).defaultCommissionPct;

  // Insert the affiliate row. Set portal_token explicitly rather than relying
  // on a DB default so the stats lookup can't break if the column has none.
  const { data: affiliate, error: affErr } = await admin
    .from("affiliates")
    .insert({
      name: displayName,
      email,
      paypal_email: null,
      code: chosenCode,
      commission_pct: commissionPct,
      stripe_promotion_code_id: created.promotion_code_id,
      notes: "Self-serve enrollment",
      created_by: user.id,
      owner_profile_id: user.id,
      portal_token: crypto.randomUUID(),
      is_active: true,
    })
    .select()
    .single();

  if (affErr || !affiliate) {
    // Roll back the Stripe promo code we just created so we don't orphan it.
    try {
      const { deactivateAffiliatePromotionCode } = await import(
        "@/lib/affiliates/stripe-coupon"
      );
      await deactivateAffiliatePromotionCode(created.promotion_code_id);
    } catch {
      /* best-effort */
    }
    // A unique-violation here means a concurrent enroll won the race — return
    // whatever now exists for this advisor instead of erroring.
    const { data: raced } = await admin
      .from("affiliates")
      .select("*")
      .eq("owner_profile_id", user.id)
      .maybeSingle();
    if (raced) return NextResponse.json(await buildEnrolledPayload(admin, raced));
    return NextResponse.json(
      { error: affErr?.message ?? "Could not enroll you. Please try again." },
      { status: 500 }
    );
  }

  const { error: codeErr } = await admin.from("affiliate_codes").insert({
    affiliate_id: affiliate.id,
    code: chosenCode,
    discount_pct: tier,
    commission_pct: commissionPct,
    stripe_coupon_id: created.coupon_id,
    stripe_promotion_code_id: created.promotion_code_id,
    is_active: true,
  });

  if (codeErr) {
    // The affiliate row exists but its code didn't persist — clean up so the
    // advisor can retry from a clean slate rather than being half-enrolled.
    try {
      const { deactivateAffiliatePromotionCode } = await import(
        "@/lib/affiliates/stripe-coupon"
      );
      await deactivateAffiliatePromotionCode(created.promotion_code_id);
    } catch {
      /* best-effort */
    }
    await admin.from("affiliates").delete().eq("id", affiliate.id);
    return NextResponse.json(
      { error: "Could not finish enrollment. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json(await buildEnrolledPayload(admin, affiliate), {
    status: 201,
  });
}
