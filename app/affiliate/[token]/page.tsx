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

interface PortalCode {
  id: string;
  code: string;
  discount_pct: number;
  commission_pct: number;
  is_active: boolean;
  active_subscribers: number;
}

interface PortalStats {
  conversions: number;
  active_annual: number;
  abandoned_count: number;
  recent_conversions: Array<{
    created_at: string;
    status: string | null;
    cycle: string | null;
    code: string | null;
    discount_pct: number | null;
    commission_pct: number | null;
  }>;
  recent_abandons: Array<{
    expired_at: string;
    amount_cents: number | null;
    plan: string | null;
    cycle: string | null;
    has_email: boolean;
  }>;
  codes: PortalCode[];
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statsRow = ((statsRows ?? []) as any[])[0];
  const stats: PortalStats = {
    conversions: Number(statsRow?.conversions ?? 0),
    active_annual: Number(statsRow?.active_annual ?? 0),
    abandoned_count: Number(statsRow?.abandoned_count ?? 0),
    recent_conversions: statsRow?.recent_conversions ?? [],
    recent_abandons: statsRow?.recent_abandons ?? [],
    codes: (statsRow?.codes ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any): PortalCode => ({
        id: c.id,
        code: c.code,
        discount_pct: Number(c.discount_pct),
        commission_pct: Number(c.commission_pct),
        is_active: Boolean(c.is_active),
        active_subscribers: Number(c.active_subscribers ?? 0),
      })
    ),
  };

  // Pre-compute per-customer economics for each code (the affiliate's
  // headline math). We assume the customer pays the full discounted annual
  // price; real payouts reconcile against Stripe invoices.
  const annualListPrice = PLAN_PRICES.standard.annual.amount;
  const codesWithEconomics = stats.codes.map((c) => {
    const discounted = Math.round(annualListPrice * (1 - c.discount_pct / 100));
    const perCustomer = Math.round(discounted * (c.commission_pct / 100));
    return {
      ...c,
      discounted_annual: discounted,
      annual_commission_per_customer: perCustomer,
      annual_recurring_commission: c.active_subscribers * perCustomer,
    };
  });

  const totalRecurringCommission = codesWithEconomics.reduce(
    (acc, c) => acc + c.annual_recurring_commission,
    0
  );

  return (
    <AffiliatePortalClient
      affiliate={affiliate}
      stats={stats}
      codes={codesWithEconomics}
      totalActiveSubscribers={stats.active_annual}
      totalRecurringCommission={totalRecurringCommission}
    />
  );
}
