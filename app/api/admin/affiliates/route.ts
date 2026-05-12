import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createAffiliatePromotionCode,
  deactivateAffiliatePromotionCode,
  DISCOUNT_TIERS,
  getTierConfig,
  type DiscountTier,
} from "@/lib/affiliates/stripe-coupon";
import { PLAN_PRICES } from "@/lib/config/plans";

const tierSchema = z.object({
  discount_pct: z.union([z.literal(20), z.literal(10), z.literal(5)]),
  commission_pct: z.number().min(0).max(100),
  // Optional — if blank we'll derive from the base code + tier suffix
  // (e.g. base "JANE" + tier 10 → "JANE10").
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/).optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  paypal_email: z.string().trim().email().optional().nullable(),
  // Base — used to derive code names if individual codes don't specify
  // their own. e.g. "JANE" → JANE20, JANE10, JANE5.
  base_code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{2,20}$/, "Letters/digits/hyphen/underscore, 2–20 chars")
    .optional(),
  tiers: z.array(tierSchema).min(1, "At least one discount tier required"),
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

function suggestBaseFromName(name: string): string {
  return name.trim().split(/\s+/)[0]?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? "PARTNER";
}

// GET /api/admin/affiliates — list all affiliates with their codes and
// conversion stats. Each affiliate can now have multiple codes; the
// response includes a `codes` array per affiliate plus rolled-up totals.
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();
  const [{ data: affiliatesRaw }, { data: codesRaw }, { data: attributedProfiles }] = await Promise.all([
    admin.from("affiliates").select("*").order("created_at", { ascending: false }),
    admin.from("affiliate_codes").select("*").order("discount_pct", { ascending: true }),
    admin
      .from("profiles")
      .select("affiliate_id, affiliate_code_id, subscription_status, billing_cycle")
      .not("affiliate_id", "is", null),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const codes = (codesRaw ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profilesArr = (attributedProfiles ?? []) as any[];

  const annualListPrice = PLAN_PRICES.standard.annual.amount;

  type CodeStats = { active_subscribers: number; annual_revenue: number; annual_commission: number };
  const codeStats = new Map<string, CodeStats>();
  for (const c of codes) {
    codeStats.set(c.id, { active_subscribers: 0, annual_revenue: 0, annual_commission: 0 });
  }

  for (const p of profilesArr) {
    if (!p.affiliate_code_id) continue;
    const code = codes.find((c) => c.id === p.affiliate_code_id);
    if (!code) continue;
    if (
      (p.subscription_status === "active" || p.subscription_status === "trialing") &&
      p.billing_cycle === "annual"
    ) {
      const s = codeStats.get(code.id);
      if (s) {
        const discounted = annualListPrice * (1 - Number(code.discount_pct) / 100);
        s.active_subscribers += 1;
        s.annual_revenue += discounted;
        s.annual_commission += discounted * (Number(code.commission_pct) / 100);
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enriched = (affiliatesRaw ?? []).map((a: any) => {
    const affCodes = codes
      .filter((c) => c.affiliate_id === a.id)
      .map((c) => ({
        ...c,
        stats: codeStats.get(c.id) ?? { active_subscribers: 0, annual_revenue: 0, annual_commission: 0 },
      }));
    const rollup = affCodes.reduce(
      (acc, c) => ({
        active_subscribers: acc.active_subscribers + c.stats.active_subscribers,
        annual_revenue: acc.annual_revenue + c.stats.annual_revenue,
        annual_commission: acc.annual_commission + c.stats.annual_commission,
      }),
      { active_subscribers: 0, annual_revenue: 0, annual_commission: 0 }
    );
    const conversions = profilesArr.filter((p) => p.affiliate_id === a.id).length;
    return { ...a, codes: affCodes, conversions, ...rollup };
  });

  return NextResponse.json({ affiliates: enriched });
}

// POST /api/admin/affiliates — create an affiliate and one-or-more codes
// in a single shot. Stripe promotion codes are created up-front for each
// requested tier; if any Stripe call fails we roll back all the codes
// we created in this request so we never leave orphans.
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
  const baseCode = parsed.data.base_code ?? suggestBaseFromName(parsed.data.name);

  // Compute each requested code's string + check uniqueness against the DB
  // before burning Stripe API calls on a collision.
  const planned: Array<{ tier: DiscountTier; code: string; commission_pct: number }> = [];
  for (const t of parsed.data.tiers) {
    const tier = t.discount_pct as DiscountTier;
    const codeStr = t.code ?? `${baseCode}${tier}`;
    if (planned.some((p) => p.code === codeStr)) {
      return NextResponse.json(
        { error: `Duplicate code "${codeStr}" in request` },
        { status: 400 }
      );
    }
    planned.push({ tier, code: codeStr, commission_pct: t.commission_pct });
  }

  const { data: existingCodes } = await admin
    .from("affiliate_codes")
    .select("code")
    .in("code", planned.map((p) => p.code));
  if ((existingCodes ?? []).length > 0) {
    const taken = (existingCodes ?? []).map((c) => (c as { code: string }).code).join(", ");
    return NextResponse.json({ error: `Codes already in use: ${taken}` }, { status: 409 });
  }

  // Create the affiliate row. Use the highest-discount tier's code as
  // the legacy `affiliates.code` so the existing admin display has
  // something to show. The "primary" commission_pct is the highest-
  // discount tier's commission (the most generous one to the customer).
  const primaryTier = planned.reduce((a, b) => (a.tier > b.tier ? a : b));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let affiliate: any;
  {
    const { data, error } = await admin
      .from("affiliates")
      .insert({
        name: parsed.data.name,
        email: parsed.data.email,
        paypal_email: parsed.data.paypal_email ?? null,
        code: primaryTier.code,
        commission_pct: primaryTier.commission_pct,
        stripe_promotion_code_id: "pending", // overwritten below
        notes: parsed.data.notes ?? null,
        created_by: auth.user.id,
      })
      .select()
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "DB error" }, { status: 500 });
    }
    affiliate = data;
  }

  // Create Stripe promotion codes for each tier, rolling back on failure.
  const createdStripeIds: string[] = [];
  const codeInserts: Array<Record<string, unknown>> = [];
  for (const p of planned) {
    try {
      const result = await createAffiliatePromotionCode(p.code, p.tier);
      createdStripeIds.push(result.promotion_code_id);
      codeInserts.push({
        affiliate_id: affiliate.id,
        code: p.code,
        discount_pct: p.tier,
        commission_pct: p.commission_pct,
        stripe_coupon_id: result.coupon_id,
        stripe_promotion_code_id: result.promotion_code_id,
        is_active: true,
      });
    } catch (err) {
      // Roll back any Stripe codes we already created this request, then
      // delete the affiliate row we inserted at the top.
      for (const id of createdStripeIds) {
        try { await deactivateAffiliatePromotionCode(id); } catch { /* best-effort */ }
      }
      await admin.from("affiliates").delete().eq("id", affiliate.id);
      const message = err instanceof Error ? err.message : "Stripe error";
      return NextResponse.json(
        { error: `Failed to create Stripe promotion code "${p.code}": ${message}` },
        { status: 500 }
      );
    }
  }

  // Insert all codes.
  const { data: insertedCodes, error: codesErr } = await admin
    .from("affiliate_codes")
    .insert(codeInserts)
    .select();
  if (codesErr) {
    for (const id of createdStripeIds) {
      try { await deactivateAffiliatePromotionCode(id); } catch { /* best-effort */ }
    }
    await admin.from("affiliates").delete().eq("id", affiliate.id);
    return NextResponse.json({ error: codesErr.message }, { status: 500 });
  }

  // Update the affiliate's legacy stripe_promotion_code_id to point at the
  // primary tier's promotion code so old-path lookups still work.
  const primaryInserted = (insertedCodes ?? []).find(
    (c) => (c as { code: string }).code === primaryTier.code
  ) as { stripe_promotion_code_id: string } | undefined;
  if (primaryInserted) {
    await admin
      .from("affiliates")
      .update({ stripe_promotion_code_id: primaryInserted.stripe_promotion_code_id })
      .eq("id", affiliate.id);
  }

  // Suppress unused-var lint — exported for forward compat.
  void DISCOUNT_TIERS;
  void getTierConfig;

  return NextResponse.json(
    { affiliate: { ...affiliate, codes: insertedCodes } },
    { status: 201 }
  );
}
