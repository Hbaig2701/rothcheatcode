import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLAN_PRICES } from "@/lib/config/plans";
import { AffiliatePortalClient } from "./portal-client";

interface AffiliateView {
  id: string;
  name: string;
  email: string;
  paypal_email: string | null;
  code: string;
  commission_pct: number;
  is_active: boolean;
  created_at: string;
}

interface PortalStats {
  conversions: number;
  active_annual: number;
  abandoned_count: number;
  recent_conversions: Array<{ created_at: string; status: string | null; cycle: string | null }>;
  recent_abandons: Array<{
    expired_at: string;
    amount_cents: number | null;
    plan: string | null;
    cycle: string | null;
    has_email: boolean;
  }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AffiliatePortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!UUID_RE.test(token)) notFound();

  const admin = createAdminClient();

  const [{ data: viewRows }, { data: statsRows }] = await Promise.all([
    admin.rpc("affiliate_portal_view", { _token: token }),
    admin.rpc("affiliate_portal_stats", { _token: token }),
  ]);

  const affiliate = ((viewRows ?? []) as AffiliateView[])[0];
  if (!affiliate) notFound();

  // affiliate_portal_stats always returns one row even when there are no
  // conversions (counts will be 0, recent_conversions will be []).
  const statsRow = ((statsRows ?? []) as Array<{
    conversions: number | string | bigint;
    active_annual: number | string | bigint;
    abandoned_count: number | string | bigint;
    recent_conversions: Array<{ created_at: string; status: string | null; cycle: string | null }>;
    recent_abandons: Array<{
      expired_at: string;
      amount_cents: number | null;
      plan: string | null;
      cycle: string | null;
      has_email: boolean;
    }>;
  }>)[0];
  const stats: PortalStats = {
    conversions: Number(statsRow?.conversions ?? 0),
    active_annual: Number(statsRow?.active_annual ?? 0),
    abandoned_count: Number(statsRow?.abandoned_count ?? 0),
    recent_conversions: statsRow?.recent_conversions ?? [],
    recent_abandons: statsRow?.recent_abandons ?? [],
  };

  // Revenue and commission baselines — derived from the discounted annual
  // list price. Real payout reconciliation should pull from Stripe invoices
  // (this dashboard is the affiliate's high-level view).
  const annualListPrice = PLAN_PRICES.standard.annual.amount;
  const discountedAnnualPerCustomer = Math.round(annualListPrice * (1 - 20 / 100));
  const annualCommissionPerCustomer = Math.round(
    discountedAnnualPerCustomer * (affiliate.commission_pct / 100)
  );
  const annualRecurringCommission = stats.active_annual * annualCommissionPerCustomer;

  return (
    <AffiliatePortalClient
      affiliate={affiliate}
      stats={stats}
      annualCommissionPerCustomer={annualCommissionPerCustomer}
      annualRecurringCommission={annualRecurringCommission}
      discountedAnnualPerCustomer={discountedAnnualPerCustomer}
    />
  );
}
