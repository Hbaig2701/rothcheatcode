import { getStripe } from "@/lib/stripe";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe Connect (Express) accounts for affiliate payouts.
 *
 * Each affiliate gets one Express account. Stripe hosts the onboarding
 * (identity, bank account, W-9 / tax ID), so we never handle bank or tax
 * details ourselves. We only ever *transfer* to these accounts — they don't
 * take payments — so `transfers` is the only capability requested.
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

/** Create the affiliate's Express account if they don't have one yet. */
export async function ensureConnectAccount(admin: Admin, aff: AffiliateForConnect): Promise<string> {
  if (aff.stripe_account_id) return aff.stripe_account_id;

  const account = await getStripe().accounts.create(
    {
      type: "express",
      country: "US",
      email: aff.email,
      business_type: "individual",
      capabilities: { transfers: { requested: true } },
      metadata: { affiliate_id: aff.id },
    },
    // Two clicks on "Set up payouts" must not create two accounts.
    { idempotencyKey: `affiliate-connect-${aff.id}` }
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
