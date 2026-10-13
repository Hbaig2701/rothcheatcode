/**
 * Move every self-serve affiliate from the 20%-off referral code to a new
 * 35%-off code (commission stays 30%).
 *
 * Stripe coupons can't change their percent_off and a promotion code can't
 * be re-pointed at another coupon, so each affiliate gets a NEW promotion
 * code (HAMZA20 → HAMZA35) on the 35% coupon, and their old 20% code is
 * deactivated. Old affiliate_codes rows stay (inactive) so any customer who
 * already redeemed the old code keeps being attributed.
 *
 * Dry run by default — prints the plan. Pass --apply to write to Stripe + DB.
 *
 *   npx tsx --env-file=.env.local scripts/migrate-affiliate-codes-35.ts
 *   npx tsx --env-file=.env.local scripts/migrate-affiliate-codes-35.ts --apply
 */
import { createClient } from "@supabase/supabase-js";
import {
  createAffiliatePromotionCode,
  deactivateAffiliatePromotionCode,
  getTierConfig,
} from "../lib/affiliates/stripe-coupon";

const NEW_TIER = 35 as const;
const OLD_TIER = 20;
const apply = process.argv.includes("--apply");

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function baseOf(code: string): string {
  return code.endsWith(String(OLD_TIER)) ? code.slice(0, -String(OLD_TIER).length) : code;
}

async function main() {
  const commissionPct = getTierConfig(NEW_TIER).defaultCommissionPct;

  const { data: affiliates, error } = await admin
    .from("affiliates")
    .select("id, name, code, stripe_promotion_code_id")
    .not("owner_profile_id", "is", null);
  if (error) throw error;

  console.log(`${apply ? "APPLYING" : "DRY RUN"} — ${affiliates?.length ?? 0} self-serve affiliates\n`);

  for (const aff of affiliates ?? []) {
    const { data: codes } = await admin
      .from("affiliate_codes")
      .select("id, code, discount_pct, is_active, stripe_promotion_code_id")
      .eq("affiliate_id", aff.id);

    if ((codes ?? []).some((c) => Number(c.discount_pct) === NEW_TIER && c.is_active)) {
      console.log(`• ${aff.name}: already has an active ${NEW_TIER}% code — skipping`);
      continue;
    }
    const oldCodes = (codes ?? []).filter((c) => Number(c.discount_pct) === OLD_TIER && c.is_active);
    const base = baseOf(aff.code as string);
    const salt = (aff.id as string).replace(/-/g, "").toUpperCase();
    const candidates = [`${base}${NEW_TIER}`, `${base}${NEW_TIER}${salt.slice(0, 2)}`, `${base}${NEW_TIER}${salt.slice(2, 4)}`];

    console.log(`• ${aff.name}: ${oldCodes.map((c) => c.code).join(", ") || "(no active 20% code)"} → ${candidates[0]}`);
    if (!apply) continue;

    let created: { promotion_code_id: string; coupon_id: string } | null = null;
    let code = "";
    for (const c of candidates) {
      try {
        created = await createAffiliatePromotionCode(c, NEW_TIER);
        code = c;
        break;
      } catch (err) {
        console.log(`    ${c} unavailable (${(err as Error).message}) — trying next`);
      }
    }
    if (!created) {
      console.log(`    ✗ could not create a ${NEW_TIER}% code — left unchanged`);
      continue;
    }

    const { error: insErr } = await admin.from("affiliate_codes").insert({
      affiliate_id: aff.id,
      code,
      discount_pct: NEW_TIER,
      commission_pct: commissionPct,
      stripe_coupon_id: created.coupon_id,
      stripe_promotion_code_id: created.promotion_code_id,
      is_active: true,
    });
    if (insErr) {
      await deactivateAffiliatePromotionCode(created.promotion_code_id).catch(() => {});
      console.log(`    ✗ DB insert failed (${insErr.message}) — rolled back Stripe code`);
      continue;
    }

    await admin
      .from("affiliates")
      .update({ code, stripe_promotion_code_id: created.promotion_code_id, commission_pct: commissionPct })
      .eq("id", aff.id);

    for (const old of oldCodes) {
      if (old.stripe_promotion_code_id) {
        await deactivateAffiliatePromotionCode(old.stripe_promotion_code_id).catch((e) =>
          console.log(`    ! couldn't deactivate ${old.code} in Stripe: ${(e as Error).message}`)
        );
      }
      await admin.from("affiliate_codes").update({ is_active: false }).eq("id", old.id);
    }
    console.log(`    ✓ ${code} live; ${oldCodes.map((c) => c.code).join(", ")} retired`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
