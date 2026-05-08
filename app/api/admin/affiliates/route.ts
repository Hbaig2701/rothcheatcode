import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAffiliatePromotionCode } from "@/lib/affiliates/stripe-coupon";
import { getStripe } from "@/lib/stripe";
import { PLAN_PRICES } from "@/lib/config/plans";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  paypal_email: z.string().trim().email().optional().nullable(),
  // Customer-facing code. Stripe allows letters, digits, hyphen, underscore.
  // We uppercase server-side; codes are unique across all affiliates.
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{3,30}$/, "3–30 chars, letters/digits/hyphen/underscore only"),
  commission_pct: z.number().min(0).max(100).default(25),
  notes: z.string().trim().max(1000).optional().nullable(),
});

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" as const, status: 401 as const };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return { error: "Forbidden" as const, status: 403 as const };
  return { user };
}

// GET /api/admin/affiliates — list all affiliates with conversion stats
// (count of profiles attributed + estimated MRR from those profiles).
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();
  const { data: affiliates, error } = await admin
    .from("affiliates")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Conversion stats — group profiles by affiliate_id, count active subs,
  // estimate annual revenue per affiliate using the configured discount.
  // We use the LIST PRICE (not actual paid amount) for this dashboard
  // estimate; exact paid amounts can be reconciled from Stripe invoices
  // when computing actual payouts.
  const annualListPrice = PLAN_PRICES.standard.annual.amount; // dollars
  const discountedAnnual = annualListPrice * (1 - 20 / 100); // 20% off

  const { data: attributedProfiles } = await admin
    .from("profiles")
    .select("affiliate_id, subscription_status, billing_cycle")
    .not("affiliate_id", "is", null);

  type Stats = { conversions: number; active: number; annualRevenue: number; annualCommission: number };
  const statsByAffiliate = new Map<string, Stats>();
  for (const a of (affiliates ?? []) as Array<{ id: string; commission_pct: number }>) {
    statsByAffiliate.set(a.id, { conversions: 0, active: 0, annualRevenue: 0, annualCommission: 0 });
  }
  for (const p of (attributedProfiles ?? []) as Array<{
    affiliate_id: string;
    subscription_status: string | null;
    billing_cycle: string | null;
  }>) {
    const s = statsByAffiliate.get(p.affiliate_id);
    if (!s) continue;
    s.conversions += 1;
    if (
      (p.subscription_status === "active" || p.subscription_status === "trialing") &&
      p.billing_cycle === "annual"
    ) {
      s.active += 1;
      s.annualRevenue += discountedAnnual;
      const aff = (affiliates ?? []).find((x) => (x as { id: string }).id === p.affiliate_id) as { commission_pct: number } | undefined;
      const rate = aff?.commission_pct ?? 25;
      s.annualCommission += discountedAnnual * (rate / 100);
    }
  }

  const enriched = (affiliates ?? []).map((a) => {
    const s = statsByAffiliate.get((a as { id: string }).id) ?? { conversions: 0, active: 0, annualRevenue: 0, annualCommission: 0 };
    return { ...a, stats: s };
  });

  return NextResponse.json({ affiliates: enriched });
}

// POST /api/admin/affiliates — create an affiliate + Stripe promotion code.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Stripe promotion codes are globally unique per Stripe account, so we
  // surface a friendly error if the requested code is taken.
  const { data: existing } = await admin
    .from("affiliates")
    .select("id")
    .eq("code", parsed.data.code)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: `Code "${parsed.data.code}" is already in use` },
      { status: 409 }
    );
  }

  // Create the Stripe promotion code first — if this fails we don't want
  // an orphan row in our DB.
  let promotion_code_id: string;
  try {
    const result = await createAffiliatePromotionCode(parsed.data.code);
    promotion_code_id = result.promotion_code_id;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error";
    return NextResponse.json(
      { error: `Failed to create Stripe promotion code: ${message}` },
      { status: 500 }
    );
  }

  const { data, error } = await admin
    .from("affiliates")
    .insert({
      name: parsed.data.name,
      email: parsed.data.email,
      paypal_email: parsed.data.paypal_email ?? null,
      code: parsed.data.code,
      commission_pct: parsed.data.commission_pct,
      stripe_promotion_code_id: promotion_code_id,
      notes: parsed.data.notes ?? null,
      created_by: auth.user.id,
    })
    .select()
    .single();

  if (error) {
    // Roll back the Stripe promotion code if the DB insert failed so we
    // don't leak orphan codes that point at no affiliate.
    try {
      await getStripe().promotionCodes.update(promotion_code_id, { active: false });
    } catch {
      // best-effort
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ affiliate: data }, { status: 201 });
}
