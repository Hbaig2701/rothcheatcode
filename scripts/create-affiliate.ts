/**
 * Enroll an existing app user as an affiliate with a custom referral code
 * (e.g. EDPROMO instead of the auto-generated EDWARD35).
 *
 * Does exactly what Settings → Refer & Earn → "Join" does, but with the code
 * you choose: a Stripe promotion code on the standard self-serve coupon
 * (35% off annual, forever, first-time customers only), plus the affiliates
 * and affiliate_codes rows linked to their profile. They then see it in
 * Refer & Earn and set up payouts themselves.
 *
 * If a promotion code with that text already exists in Stripe but isn't
 * known to the app (made by hand in the dashboard), pass --replace-existing
 * to deactivate it first. Refused if it has ever been redeemed.
 *
 * Dry run by default; --apply writes to Stripe + DB.
 *
 *   npx tsx --env-file=.env.local scripts/create-affiliate.ts --email a@b.com --name "Full Name" --code EDPROMO
 *   ... --replace-existing --apply
 */
import { createClient } from "@supabase/supabase-js";
import { getStripe } from "../lib/stripe";
import {
  createAffiliatePromotionCode,
  deactivateAffiliatePromotionCode,
  getTierConfig,
  type DiscountTier,
} from "../lib/affiliates/stripe-coupon";

const TIER: DiscountTier = 35; // keep in sync with SELF_SERVE_TIER in app/api/affiliate/me/route.ts

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}
const apply = process.argv.includes("--apply");
const replaceExisting = process.argv.includes("--replace-existing");

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name")?.trim();
  const code = arg("code")?.trim().toUpperCase();
  if (!email || !name || !code) throw new Error("--email, --name and --code are required");
  if (!/^[A-Z0-9]{3,20}$/.test(code)) throw new Error("Code must be 3-20 letters/digits");

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const stripe = getStripe();

  console.log(`${apply ? "APPLYING" : "DRY RUN"} — ${name} <${email}> → ${code}\n`);

  const { data: profile } = await admin.from("profiles").select("id, email").ilike("email", email).maybeSingle();
  if (!profile) throw new Error(`No app account for ${email} — they need to sign up first`);
  console.log(`✓ app account ${profile.id}`);

  const { data: existingAff } = await admin
    .from("affiliates")
    .select("id, code")
    .or(`owner_profile_id.eq.${profile.id},email.ilike.${email}`)
    .maybeSingle();
  if (existingAff) throw new Error(`Already an affiliate (code ${existingAff.code}) — nothing to do`);
  console.log("✓ not an affiliate yet");

  const { data: dbCode } = await admin.from("affiliate_codes").select("id").eq("code", code).maybeSingle();
  if (dbCode) throw new Error(`${code} already belongs to another affiliate`);

  const live = await stripe.promotionCodes.list({ code, active: true, limit: 10 });
  for (const p of live.data) {
    if (!replaceExisting) {
      throw new Error(`An active Stripe promotion code ${code} (${p.id}) already exists — rerun with --replace-existing`);
    }
    if (p.times_redeemed > 0) {
      throw new Error(`Stripe code ${code} (${p.id}) has been redeemed ${p.times_redeemed}x — won't replace it`);
    }
    console.log(`• will deactivate hand-made Stripe code ${p.id} (never redeemed)`);
  }

  const commissionPct = getTierConfig(TIER).defaultCommissionPct;
  console.log(`• will create ${code}: ${TIER}% off annual, forever, new customers only; ${commissionPct}% commission`);
  if (!apply) return;

  for (const p of live.data) await deactivateAffiliatePromotionCode(p.id);
  const created = await createAffiliatePromotionCode(code, TIER);

  const { data: affiliate, error: affErr } = await admin
    .from("affiliates")
    .insert({
      name,
      email,
      paypal_email: null,
      code,
      commission_pct: commissionPct,
      stripe_promotion_code_id: created.promotion_code_id,
      notes: "Custom code set up by admin",
      created_by: profile.id,
      owner_profile_id: profile.id,
      portal_token: crypto.randomUUID(),
      is_active: true,
    })
    .select()
    .single();
  if (affErr || !affiliate) {
    await deactivateAffiliatePromotionCode(created.promotion_code_id).catch(() => {});
    throw new Error(`affiliates insert failed: ${affErr?.message}`);
  }

  const { error: codeErr } = await admin.from("affiliate_codes").insert({
    affiliate_id: affiliate.id,
    code,
    discount_pct: TIER,
    commission_pct: commissionPct,
    stripe_coupon_id: created.coupon_id,
    stripe_promotion_code_id: created.promotion_code_id,
    is_active: true,
  });
  if (codeErr) {
    await deactivateAffiliatePromotionCode(created.promotion_code_id).catch(() => {});
    await admin.from("affiliates").delete().eq("id", affiliate.id);
    throw new Error(`affiliate_codes insert failed: ${codeErr.message} — rolled back`);
  }

  console.log(`\n✓ ${name} enrolled. Code ${code} is live (${created.promotion_code_id}).`);
}

main().catch((err) => {
  console.error(`✗ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
