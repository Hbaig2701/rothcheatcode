/**
 * Backfill profiles.canceled_at (decision date) and profiles.churned_at
 * (actual subscription-end date) from Stripe for advisors who have already
 * churned.
 *
 * Why: the old customer.subscription.deleted handler overwrote canceled_at with
 * the deletion timestamp, so the original "decided to cancel" date was lost and
 * there was no separate "actually churned" date. Stripe still retains both on
 * the subscription object (canceled_at = decision, ended_at = end), so we can
 * recover them.
 *
 * Usage:
 *   npx tsx scripts/backfill-churn-dates.ts          # dry run (no writes)
 *   npx tsx scripts/backfill-churn-dates.ts --apply  # write the corrected dates
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + STRIPE_SECRET_KEY
 * from .env.local.
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { getStripe } from "../lib/stripe";

config({ path: resolve(process.cwd(), ".env.local") });

const apply = process.argv.includes("--apply");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const stripe = getStripe();

const iso = (unix: number | null | undefined): string | null =>
  unix ? new Date(unix * 1000).toISOString() : null;

(async () => {
  const { data: churned, error } = await admin
    .from("profiles")
    .select("id, email, subscription_status, canceled_at, churned_at, stripe_customer_id")
    .eq("subscription_status", "canceled")
    .not("stripe_customer_id", "is", null);

  if (error) {
    console.error("Query failed:", error.message);
    process.exit(1);
  }

  console.log(`${apply ? "APPLYING" : "DRY RUN"} — ${churned?.length ?? 0} churned advisors with a Stripe customer\n`);

  let updated = 0;
  let skipped = 0;

  for (const p of churned ?? []) {
    // The subscription was deleted, so we no longer have its ID — find it via
    // the customer. Stripe keeps canceled subscriptions retrievable.
    let subs;
    try {
      subs = await stripe.subscriptions.list({
        customer: p.stripe_customer_id!,
        status: "all",
        limit: 20,
      });
    } catch (e) {
      console.warn(`  ${p.email}: Stripe list failed — ${e instanceof Error ? e.message : e}`);
      skipped++;
      continue;
    }

    // Pick the most recently-ended canceled subscription.
    const canceledSubs = subs.data
      .filter((s) => s.canceled_at != null || s.ended_at != null)
      .sort((a, b) => (b.ended_at ?? b.canceled_at ?? 0) - (a.ended_at ?? a.canceled_at ?? 0));

    const sub = canceledSubs[0];
    if (!sub) {
      console.warn(`  ${p.email}: no canceled subscription found on customer`);
      skipped++;
      continue;
    }

    const decidedIso = iso(sub.canceled_at);
    const endedIso = iso(sub.ended_at);

    const changes: Record<string, string | null> = {};
    if (decidedIso && decidedIso !== p.canceled_at) changes.canceled_at = decidedIso;
    if (endedIso && endedIso !== p.churned_at) changes.churned_at = endedIso;

    if (Object.keys(changes).length === 0) {
      skipped++;
      continue;
    }

    console.log(
      `  ${p.email}\n` +
        `     decided(canceled_at): ${p.canceled_at ?? "—"}  →  ${changes.canceled_at ?? p.canceled_at ?? "—"}\n` +
        `     churned(churned_at):  ${p.churned_at ?? "—"}  →  ${changes.churned_at ?? p.churned_at ?? "—"}`
    );

    if (apply) {
      const { error: updErr } = await admin.from("profiles").update(changes).eq("id", p.id);
      if (updErr) {
        console.warn(`     update failed: ${updErr.message}`);
        skipped++;
        continue;
      }
    }
    updated++;
  }

  console.log(`\n${apply ? "Updated" : "Would update"}: ${updated} · Skipped: ${skipped}`);
  if (!apply) console.log("Run again with --apply to write these changes.");
  process.exit(0);
})();
