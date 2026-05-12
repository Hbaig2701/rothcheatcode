import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deactivateAffiliatePromotionCode, activateAffiliatePromotionCode } from "@/lib/affiliates/stripe-coupon";

const patchSchema = z.object({
  commission_pct: z.number().min(0).max(100).optional(),
  paypal_email: z.string().trim().email().nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  is_active: z.boolean().optional(),
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
  return {};
}

// PATCH /api/admin/affiliates/[id] — update commission rate, paypal, notes,
// or toggle active status. Activating/deactivating also flips the Stripe
// promotion code so customers can no longer redeem a disabled affiliate.
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await ctx.params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("affiliates")
    .select("id, is_active")
    .eq("id", id)
    .single();
  if (!existing) {
    return NextResponse.json({ error: "Affiliate not found" }, { status: 404 });
  }

  // Sync Stripe state across ALL of this affiliate's codes when active is
  // flipped. Single legacy stripe_promotion_code_id is no longer the
  // source of truth — affiliates can have up to 3 codes (20/10/5).
  if (parsed.data.is_active !== undefined && parsed.data.is_active !== existing.is_active) {
    const { data: codes } = await admin
      .from("affiliate_codes")
      .select("stripe_promotion_code_id")
      .eq("affiliate_id", id);
    const codeIds = ((codes ?? []) as Array<{ stripe_promotion_code_id: string }>)
      .map((c) => c.stripe_promotion_code_id);
    try {
      await Promise.all(
        codeIds.map((promoId) =>
          parsed.data.is_active
            ? activateAffiliatePromotionCode(promoId)
            : deactivateAffiliatePromotionCode(promoId)
        )
      );
      // Mirror the affiliate-level toggle onto each affiliate_codes row so
      // the portal + admin UI reflect the same state.
      await admin
        .from("affiliate_codes")
        .update({ is_active: parsed.data.is_active })
        .eq("affiliate_id", id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Stripe error";
      return NextResponse.json(
        { error: `Failed to sync Stripe promotion codes: ${message}` },
        { status: 500 }
      );
    }
  }

  const { data, error } = await admin
    .from("affiliates")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ affiliate: data });
}
