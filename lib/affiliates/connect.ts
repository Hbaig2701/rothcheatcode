import { getStripe } from "@/lib/stripe";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe Connect (Express) accounts for affiliate payouts.
 *
 * Each affiliate gets one Express account. Stripe hosts the onboarding
 * (identity, bank account, W-9 / tax ID), so we never handle bank or tax
 * details ourselves. We only ever *transfer* to these accounts; card_payments
 * is requested too only because Stripe requires it for US accounts.
 *
 * Account status is pulled from Stripe on demand (when the advisor opens
 * Refer & Earn, returns from onboarding, or the payout job runs) instead of
 * via Connect webhooks, so no second webhook endpoint is needed.
 */

type Admin = ReturnType<typeof createAdminClient>;

export type PayoutAccountStatus = "not_started" | "incomplete" | "active";

interface AffiliateForConnect {
  id: string;
  email: string;
  stripe_account_id: string | null;
}

function settingsReturnUrl(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.retirementexpert.ai").replace(/\/$/, "");
  return `${base}/settings?payouts=return#refer`;
}

/** Countries an affiliate can be paid in. The platform is Canadian; Stripe
 *  supports paying connected accounts in both (cross-border for the US). */
export const PAYOUT_COUNTRIES = ["US", "CA"] as const;
export type PayoutCountry = (typeof PAYOUT_COUNTRIES)[number];

export function isPayoutCountry(v: unknown): v is PayoutCountry {
  return typeof v === "string" && (PAYOUT_COUNTRIES as readonly string[]).includes(v);
}

/**
 * Return the affiliate's Express account for `country`, creating it if needed.
 *
 * Stripe fixes an account's country at creation. If the affiliate already has
 * an account for another country and never finished its setup, it's deleted
 * and replaced. One they finished can't be swapped here — that needs support.
 */
export async function ensureConnectAccount(
  admin: Admin,
  aff: AffiliateForConnect,
  country: PayoutCountry
): Promise<string> {
  const stripe = getStripe();
  let replacing: string | null = null;

  if (aff.stripe_account_id) {
    const existing = await stripe.accounts.retrieve(aff.stripe_account_id);
    if (existing.country === country) return existing.id;
    if (existing.details_submitted) {
      throw new Error(
        "Your payout account is already set up for another country. Contact support to change it."
      );
    }
    await stripe.accounts.del(existing.id);
    await admin
      .from("affiliates")
      .update({ stripe_account_id: null, payouts_enabled: false })
      .eq("id", aff.id)
      .eq("stripe_account_id", existing.id);
    replacing = existing.id;
  }

  const account = await stripe.accounts.create(
    {
      type: "express",
      country,
      email: aff.email,
      business_type: "individual",
      // Stripe won't create a US account with `transfers` alone ("cannot
      // request transfers without card_payments for accounts in US"), so
      // both are requested even though affiliates only ever receive transfers.
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      // Pre-answer "what does this business do" so onboarding doesn't ask
      // advisors for a business website.
      business_profile: {
        product_description: "Referral commissions earned from Retirement Expert (retirementexpert.ai).",
      },
      metadata: { affiliate_id: aff.id },
    },
    // Two clicks on "Set up payouts" must not create two accounts. Keyed by
    // the account being replaced so a later country switch gets a fresh key.
    { idempotencyKey: `affiliate-connect-v3-${aff.id}-${country}-${replacing ?? "new"}` }
  );

  const { error } = await admin
    .from("affiliates")
    .update({ stripe_account_id: account.id })
    .eq("id", aff.id)
    .is("stripe_account_id", null);
  if (error) throw new Error(`Could not save payout account: ${error.message}`);
  return account.id;
}

/** One-time URL to Stripe's hosted onboarding (or to finish it). */
export async function createOnboardingLink(accountId: string): Promise<string> {
  const link = await getStripe().accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: settingsReturnUrl(),
    return_url: settingsReturnUrl(),
  });
  return link.url;
}

/** One-time URL to the affiliate's Stripe Express dashboard (payout history, bank, tax forms). */
export async function createDashboardLink(accountId: string): Promise<string> {
  const link = await getStripe().accounts.createLoginLink(accountId);
  return link.url;
}

/** Read the account from Stripe and cache payouts_enabled on the affiliate row. */
export async function syncConnectAccount(
  admin: Admin,
  affiliateId: string,
  accountId: string | null
): Promise<PayoutAccountStatus> {
  if (!accountId) return "not_started";
  const account = await getStripe().accounts.retrieve(accountId);
  const enabled =
    account.capabilities?.transfers === "active" && account.payouts_enabled === true;
  await admin.from("affiliates").update({ payouts_enabled: enabled }).eq("id", affiliateId);
  return enabled ? "active" : "incomplete";
}
