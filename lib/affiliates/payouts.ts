import { getStripe } from "@/lib/stripe";
import type { createAdminClient } from "@/lib/supabase/admin";
import { MIN_PAYOUT_CENTS } from "./commissions";
import { syncConnectAccount } from "./connect";

/**
 * Monthly affiliate payout run (called by /api/cron/affiliate-payouts).
 *
 * For each affiliate with a Stripe payout account:
 *   1. Finish any payout a previous run left 'processing' (crash between the
 *      claim and the transfer). The transfer is found by transfer_group, so a
 *      retry can never pay twice.
 *   2. Claim every ledger row past its hold period into a new payout, if they
 *      net to MIN_PAYOUT_CENTS or more (claim_affiliate_payout, atomic).
 *   3. Transfer that amount to their Express account. Stripe pays it to their
 *      bank on the account's payout schedule.
 * A failed transfer marks the payout 'failed' and releases its rows, so the
 * balance is picked up again next run.
 */

type Admin = ReturnType<typeof createAdminClient>;

export interface PayoutRunResult {
  affiliate_id: string;
  name: string;
  outcome: "paid" | "skipped" | "failed";
  amount_cents?: number;
  reason?: string;
}

async function transferForPayout(
  payoutId: string,
  accountId: string,
  amountCents: number
): Promise<string> {
  const stripe = getStripe();
  const existing = await stripe.transfers.list({ transfer_group: payoutId, limit: 1 });
  if (existing.data[0]) return existing.data[0].id;

  const transfer = await stripe.transfers.create(
    {
      amount: amountCents,
      currency: "usd",
      destination: accountId,
      transfer_group: payoutId,
      description: "Retirement Expert referral commissions",
      metadata: { affiliate_payout_id: payoutId },
    },
    { idempotencyKey: `affiliate-payout-${payoutId}` }
  );
  return transfer.id;
}

async function settlePayout(
  admin: Admin,
  payoutId: string,
  accountId: string,
  amountCents: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const transferId = await transferForPayout(payoutId, accountId, amountCents);
    await admin
      .from("affiliate_payouts")
      .update({ status: "paid", stripe_transfer_id: transferId, paid_at: new Date().toISOString() })
      .eq("id", payoutId);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Release the rows so next month's run picks the balance up again.
    await admin.from("affiliate_commissions").update({ payout_id: null }).eq("payout_id", payoutId);
    await admin.from("affiliate_payouts").update({ status: "failed", error: message }).eq("id", payoutId);
    return { ok: false, error: message };
  }
}

export async function runAffiliatePayouts(admin: Admin): Promise<PayoutRunResult[]> {
  const { data: affiliates, error } = await admin
    .from("affiliates")
    .select("id, name, stripe_account_id")
    .not("stripe_account_id", "is", null);
  if (error) throw new Error(`Could not load affiliates: ${error.message}`);

  const results: PayoutRunResult[] = [];

  for (const aff of affiliates ?? []) {
    const base = { affiliate_id: aff.id as string, name: aff.name as string };
    const accountId = aff.stripe_account_id as string;

    try {
      const status = await syncConnectAccount(admin, aff.id, accountId);
      if (status !== "active") {
        results.push({ ...base, outcome: "skipped", reason: "payout account not finished" });
        continue;
      }

      // 1. Resume anything left mid-flight by an earlier run.
      const { data: stuck } = await admin
        .from("affiliate_payouts")
        .select("id, amount_cents")
        .eq("affiliate_id", aff.id)
        .eq("status", "processing");
      for (const p of stuck ?? []) {
        const r = await settlePayout(admin, p.id, accountId, Number(p.amount_cents));
        results.push(
          r.ok
            ? { ...base, outcome: "paid", amount_cents: Number(p.amount_cents), reason: "resumed" }
            : { ...base, outcome: "failed", amount_cents: Number(p.amount_cents), reason: r.error }
        );
      }

      // 2. Claim this month's balance.
      const { data: claimed, error: claimErr } = await admin.rpc("claim_affiliate_payout", {
        _affiliate_id: aff.id,
        _min_cents: MIN_PAYOUT_CENTS,
      });
      if (claimErr) throw new Error(claimErr.message);
      const claim = ((claimed ?? []) as Array<{ payout_id: string; amount_cents: number }>)[0];
      if (!claim) {
        results.push({ ...base, outcome: "skipped", reason: "balance under minimum" });
        continue;
      }

      // 3. Transfer it.
      const amount = Number(claim.amount_cents);
      const r = await settlePayout(admin, claim.payout_id, accountId, amount);
      results.push(
        r.ok
          ? { ...base, outcome: "paid", amount_cents: amount }
          : { ...base, outcome: "failed", amount_cents: amount, reason: r.error }
      );
    } catch (err) {
      results.push({ ...base, outcome: "failed", reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return results;
}

/** Balance summary for the advisor-facing Refer & Earn tab. */
export async function getEarningsSummary(admin: Admin, affiliateId: string) {
  const [{ data: rows }, { data: payoutRows }] = await Promise.all([
    admin
      .from("affiliate_commissions")
      .select("amount_cents, available_at, payout_id")
      .eq("affiliate_id", affiliateId),
    admin
      .from("affiliate_payouts")
      .select("id, amount_cents, status, created_at, paid_at")
      .eq("affiliate_id", affiliateId)
      .neq("status", "failed")
      .order("created_at", { ascending: false }),
  ]);

  const payouts = (payoutRows ?? []) as Array<{
    id: string;
    amount_cents: number;
    status: "processing" | "paid";
    created_at: string;
    paid_at: string | null;
  }>;
  const paidIds = new Set(payouts.filter((p) => p.status === "paid").map((p) => p.id));

  const now = Date.now();
  let pending = 0;
  let available = 0;
  let paid = 0;
  for (const r of (rows ?? []) as Array<{ amount_cents: number; available_at: string; payout_id: string | null }>) {
    const amt = Number(r.amount_cents);
    if (r.payout_id && paidIds.has(r.payout_id)) paid += amt;
    else if (r.payout_id || new Date(r.available_at).getTime() <= now) available += amt; // cleared, or transfer in flight
    else pending += amt;
  }

  return {
    pending_cents: pending,
    available_cents: available,
    paid_cents: paid,
    min_payout_cents: MIN_PAYOUT_CENTS,
    payouts: payouts.slice(0, 24).map((p) => ({
      id: p.id,
      amount_cents: Number(p.amount_cents),
      status: p.status,
      date: p.paid_at ?? p.created_at,
    })),
  };
}
