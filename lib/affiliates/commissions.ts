import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import type { createAdminClient } from "@/lib/supabase/admin";
import { COMMISSION_HOLD_DAYS, MIN_PAYOUT_CENTS } from "./constants";

/**
 * Affiliate commission ledger (table `affiliate_commissions`).
 *
 * Every paid invoice from a referred customer adds a +row worth
 * commission_pct of what they paid (pre-tax). Refunds and chargebacks add
 * −rows pro-rated against that commission. The monthly payout job transfers
 * whatever has cleared the hold period — see lib/affiliates/payouts.ts.
 *
 * All Stripe → ledger writes are keyed by (kind, source_id) so webhook
 * retries are no-ops.
 */

type Admin = ReturnType<typeof createAdminClient>;

export { COMMISSION_HOLD_DAYS, MIN_PAYOUT_CENTS };

// ── Pure math (unit-tested) ──────────────────────────────────────────────

/** Pre-tax amount a commission is computed on. Never negative. */
export function commissionBaseCents(amountPaidCents: number, taxCents: number): number {
  return Math.max(0, amountPaidCents - Math.max(0, taxCents));
}

export function commissionCents(baseCents: number, commissionPct: number): number {
  return Math.round((baseCents * commissionPct) / 100);
}

/**
 * Negative ledger amount for a refund/dispute of `reversedCents` (gross,
 * incl. tax) against an invoice where the customer paid `paidCents` and the
 * affiliate earned `commission`. Pro-rated, and capped so total reversals
 * never exceed what's left of the commission. Returns 0 or a negative int.
 */
export function reversalCents(
  commission: number,
  paidCents: number,
  reversedCents: number,
  alreadyReversed: number
): number {
  if (commission <= 0 || paidCents <= 0 || reversedCents <= 0) return 0;
  const share = Math.round((commission * Math.min(reversedCents, paidCents)) / paidCents);
  const remaining = Math.max(0, commission - Math.max(0, alreadyReversed));
  const amount = Math.min(share, remaining);
  return amount > 0 ? -amount : 0;
}

export function availableAt(paidAt: Date, holdDays = COMMISSION_HOLD_DAYS): string {
  return new Date(paidAt.getTime() + holdDays * 86_400_000).toISOString();
}

// ── Attribution ──────────────────────────────────────────────────────────

interface Attribution {
  affiliateId: string;
  commissionPct: number;
  customerProfileId: string | null;
}

function promoIdOf(d: string | Stripe.Discount | Stripe.DeletedDiscount | null | undefined): string | null {
  if (!d || typeof d === "string") return null;
  const p = (d as Stripe.Discount).promotion_code;
  if (!p) return null;
  return typeof p === "string" ? p : p.id;
}

/**
 * True when the referral is the affiliate themselves — either the same
 * profile, or the Stripe customer that pays for the affiliate's own account.
 * Self-referrals earn no commission.
 */
export async function isSelfReferral(
  admin: Admin,
  affiliateId: string,
  who: { profileId?: string | null; stripeCustomerId?: string | null }
): Promise<boolean> {
  const { data: aff } = await admin
    .from("affiliates")
    .select("owner_profile_id")
    .eq("id", affiliateId)
    .maybeSingle();
  const ownerId = aff?.owner_profile_id as string | null | undefined;
  if (!ownerId) return false;
  if (who.profileId && who.profileId === ownerId) return true;
  if (who.stripeCustomerId) {
    const { data: owner } = await admin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", ownerId)
      .maybeSingle();
    if (owner?.stripe_customer_id && owner.stripe_customer_id === who.stripeCustomerId) return true;
  }
  return false;
}

/**
 * Which affiliate (and at what rate) a paid invoice belongs to.
 *
 * The invoice's own discount is checked first: the affiliate coupon lasts
 * forever, so every renewal carries the referral's promotion code, and this
 * works even when invoice.paid lands before the profile exists (new signups
 * create their profile on /welcome, after checkout). Falls back to the
 * attribution stored on the profile.
 */
async function resolveAttribution(admin: Admin, invoice: Stripe.Invoice): Promise<Attribution | null> {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return null;

  const { data: profile } = await admin
    .from("profiles")
    .select("id, affiliate_id, affiliate_code_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  // Cheap exit for the common case: no discount on the invoice and nobody
  // referred this customer.
  const hasDiscount = (invoice.discounts?.length ?? 0) > 0;
  if (!hasDiscount && !profile?.affiliate_id) return null;

  let codeRow: { id: string; affiliate_id: string; commission_pct: number | string } | null = null;

  if (hasDiscount) {
    const full = await getStripe().invoices.retrieve(invoice.id!, { expand: ["discounts"] });
    for (const d of full.discounts ?? []) {
      const promoId = promoIdOf(d);
      if (!promoId) continue;
      const { data } = await admin
        .from("affiliate_codes")
        .select("id, affiliate_id, commission_pct")
        .eq("stripe_promotion_code_id", promoId)
        .maybeSingle();
      if (data) {
        codeRow = data;
        break;
      }
    }
  }

  if (!codeRow && profile?.affiliate_code_id) {
    const { data } = await admin
      .from("affiliate_codes")
      .select("id, affiliate_id, commission_pct")
      .eq("id", profile.affiliate_code_id)
      .maybeSingle();
    codeRow = data;
  }

  const affiliateId = codeRow?.affiliate_id ?? (profile?.affiliate_id as string | null) ?? null;
  if (!affiliateId) return null;

  let pct = codeRow ? Number(codeRow.commission_pct) : NaN;
  if (!Number.isFinite(pct)) {
    const { data: aff } = await admin
      .from("affiliates")
      .select("commission_pct")
      .eq("id", affiliateId)
      .maybeSingle();
    pct = Number(aff?.commission_pct);
  }
  if (!Number.isFinite(pct) || pct <= 0) return null;

  if (await isSelfReferral(admin, affiliateId, { profileId: profile?.id, stripeCustomerId: customerId })) {
    console.warn(`[Affiliate] Skipping self-referral commission: affiliate ${affiliateId}, customer ${customerId}`);
    return null;
  }

  return { affiliateId, commissionPct: pct, customerProfileId: (profile?.id as string | undefined) ?? null };
}

// ── Ledger writes (called from the Stripe webhook) ───────────────────────

/** invoice.paid → +commission row. */
export async function recordInvoiceCommission(admin: Admin, invoice: Stripe.Invoice): Promise<void> {
  if (!invoice.id || !invoice.amount_paid || invoice.amount_paid <= 0) return;

  const attribution = await resolveAttribution(admin, invoice);
  if (!attribution) return;

  const tax = (invoice.total_taxes ?? []).reduce((s, t) => s + (t.amount ?? 0), 0);
  const base = commissionBaseCents(invoice.amount_paid, tax);
  const amount = commissionCents(base, attribution.commissionPct);
  if (amount <= 0) return;

  const paidAtUnix = invoice.status_transitions?.paid_at ?? Math.floor(Date.now() / 1000);
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;

  const { error } = await admin.from("affiliate_commissions").upsert(
    {
      affiliate_id: attribution.affiliateId,
      customer_profile_id: attribution.customerProfileId,
      kind: "commission",
      source_id: invoice.id,
      stripe_invoice_id: invoice.id,
      stripe_customer_id: customerId,
      paid_amount_cents: invoice.amount_paid,
      base_amount_cents: base,
      commission_pct: attribution.commissionPct,
      amount_cents: amount,
      available_at: availableAt(new Date(paidAtUnix * 1000)),
    },
    { onConflict: "kind,source_id", ignoreDuplicates: true }
  );
  if (error) throw new Error(`affiliate commission insert failed: ${error.message}`);
  console.log(`[Affiliate] Commission ${amount}¢ for affiliate ${attribution.affiliateId} on invoice ${invoice.id}`);
}

/** Find the invoice a PaymentIntent paid (the 2025+ API has no charge.invoice). */
async function invoiceIdForPaymentIntent(paymentIntentId: string): Promise<string | null> {
  const list = await getStripe().invoicePayments.list({
    payment: { type: "payment_intent", payment_intent: paymentIntentId },
    limit: 1,
  });
  const inv = list.data[0]?.invoice;
  if (!inv) return null;
  return typeof inv === "string" ? inv : inv.id ?? null;
}

interface CommissionRow {
  affiliate_id: string;
  customer_profile_id: string | null;
  stripe_customer_id: string | null;
  paid_amount_cents: number;
  base_amount_cents: number;
  commission_pct: number;
  amount_cents: number;
}

/** The original +commission for an invoice, and how much has been reversed so far. */
async function loadInvoiceCommission(
  admin: Admin,
  invoiceId: string
): Promise<{ row: CommissionRow; reversed: number } | null> {
  const { data } = await admin
    .from("affiliate_commissions")
    .select("kind, affiliate_id, customer_profile_id, stripe_customer_id, paid_amount_cents, base_amount_cents, commission_pct, amount_cents")
    .eq("stripe_invoice_id", invoiceId);
  const rows = (data ?? []) as Array<CommissionRow & { kind: string }>;
  const original = rows.find((r) => r.kind === "commission");
  if (!original) return null;
  // Net of refunds/disputes/reinstatements, expressed as a positive amount reversed.
  const reversed = -rows.filter((r) => r.kind !== "commission").reduce((s, r) => s + Number(r.amount_cents), 0);
  return {
    row: {
      ...original,
      paid_amount_cents: Number(original.paid_amount_cents),
      base_amount_cents: Number(original.base_amount_cents),
      commission_pct: Number(original.commission_pct),
      amount_cents: Number(original.amount_cents),
    },
    reversed,
  };
}

async function insertReversal(
  admin: Admin,
  kind: "refund" | "dispute",
  sourceId: string,
  invoiceId: string,
  reversedGrossCents: number
): Promise<void> {
  const loaded = await loadInvoiceCommission(admin, invoiceId);
  if (!loaded) return; // not a referred customer's invoice

  const { row, reversed } = loaded;
  const amount = reversalCents(row.amount_cents, row.paid_amount_cents, reversedGrossCents, reversed);
  if (amount === 0) return;

  const { error } = await admin.from("affiliate_commissions").upsert(
    {
      affiliate_id: row.affiliate_id,
      customer_profile_id: row.customer_profile_id,
      kind,
      source_id: sourceId,
      stripe_invoice_id: invoiceId,
      stripe_customer_id: row.stripe_customer_id,
      paid_amount_cents: row.paid_amount_cents,
      base_amount_cents: row.base_amount_cents,
      commission_pct: row.commission_pct,
      amount_cents: amount,
      // Reversals count against the very next payout.
      available_at: new Date().toISOString(),
    },
    { onConflict: "kind,source_id", ignoreDuplicates: true }
  );
  if (error) throw new Error(`affiliate ${kind} reversal insert failed: ${error.message}`);
  console.log(`[Affiliate] ${kind} reversal ${amount}¢ for affiliate ${row.affiliate_id} on invoice ${invoiceId} (${sourceId})`);
}

/** charge.refunded → one −row per refund on the charge (keyed by refund id). */
export async function recordChargeRefunds(admin: Admin, charge: Stripe.Charge): Promise<void> {
  const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!pi) return;
  const invoiceId = await invoiceIdForPaymentIntent(pi);
  if (!invoiceId) return;

  const refunds = await getStripe().refunds.list({ charge: charge.id, limit: 100 });
  for (const r of refunds.data) {
    if (r.status === "failed" || r.status === "canceled") continue;
    await insertReversal(admin, "refund", r.id, invoiceId, r.amount);
  }
}

/** charge.dispute.created → −row for the disputed amount. */
export async function recordDispute(admin: Admin, dispute: Stripe.Dispute): Promise<void> {
  const pi = typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id;
  if (!pi) return;
  const invoiceId = await invoiceIdForPaymentIntent(pi);
  if (!invoiceId) return;
  await insertReversal(admin, "dispute", dispute.id, invoiceId, dispute.amount);
}

/** charge.dispute.closed with status 'won' → reinstate the dispute reversal. */
export async function recordDisputeWon(admin: Admin, dispute: Stripe.Dispute): Promise<void> {
  if (dispute.status !== "won") return;
  const { data: rev } = await admin
    .from("affiliate_commissions")
    .select("*")
    .eq("kind", "dispute")
    .eq("source_id", dispute.id)
    .maybeSingle();
  if (!rev) return;

  const { id: _id, created_at: _c, payout_id: _p, ...rest } = rev as Record<string, unknown>;
  void _id; void _c; void _p;
  const { error } = await admin.from("affiliate_commissions").upsert(
    {
      ...rest,
      kind: "dispute_won",
      amount_cents: -Number(rev.amount_cents),
      available_at: new Date().toISOString(),
    },
    { onConflict: "kind,source_id", ignoreDuplicates: true }
  );
  if (error) throw new Error(`affiliate dispute_won insert failed: ${error.message}`);
}
