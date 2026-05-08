import { createAdminClient } from "@/lib/supabase/admin";
import { PLAN_PRICES } from "@/lib/config/plans";
import { AffiliatesPanel } from "./affiliates-panel";

interface AffiliateRow {
  id: string;
  name: string;
  email: string;
  paypal_email: string | null;
  code: string;
  commission_pct: number;
  stripe_promotion_code_id: string;
  portal_token: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

interface ProfileRow {
  affiliate_id: string;
  subscription_status: string | null;
  billing_cycle: string | null;
}

export default async function AffiliatesPage() {
  const admin = createAdminClient();

  const { data: affiliatesRaw } = await admin
    .from("affiliates")
    .select("*")
    .order("created_at", { ascending: false });

  const affiliates = (affiliatesRaw ?? []) as AffiliateRow[];

  const [{ data: attributedProfiles }, { data: abandonedRows }] = await Promise.all([
    admin
      .from("profiles")
      .select("affiliate_id, subscription_status, billing_cycle")
      .not("affiliate_id", "is", null),
    admin
      .from("affiliate_abandoned_checkouts")
      .select("affiliate_id"),
  ]);

  // Conversion + revenue/commission stats per affiliate. We use the
  // discounted annual list price as the per-customer baseline; precise
  // payout reconciliation should pull from Stripe invoices when actually
  // sending money.
  const annualListPrice = PLAN_PRICES.standard.annual.amount;
  const discountedAnnual = annualListPrice * (1 - 20 / 100);

  type Stats = {
    conversions: number;
    activeAnnual: number;
    annualRevenue: number;
    annualCommission: number;
    abandoned: number;
  };
  const statsByAffiliate = new Map<string, Stats>();
  for (const a of affiliates) {
    statsByAffiliate.set(a.id, {
      conversions: 0,
      activeAnnual: 0,
      annualRevenue: 0,
      annualCommission: 0,
      abandoned: 0,
    });
  }
  for (const p of (attributedProfiles ?? []) as ProfileRow[]) {
    const s = statsByAffiliate.get(p.affiliate_id);
    if (!s) continue;
    s.conversions += 1;
    if (
      (p.subscription_status === "active" || p.subscription_status === "trialing") &&
      p.billing_cycle === "annual"
    ) {
      s.activeAnnual += 1;
      s.annualRevenue += discountedAnnual;
      const aff = affiliates.find((x) => x.id === p.affiliate_id);
      const rate = aff?.commission_pct ?? 25;
      s.annualCommission += discountedAnnual * (rate / 100);
    }
  }
  for (const r of ((abandonedRows ?? []) as Array<{ affiliate_id: string }>)) {
    const s = statsByAffiliate.get(r.affiliate_id);
    if (s) s.abandoned += 1;
  }

  const enriched = affiliates.map((a) => ({
    ...a,
    stats: statsByAffiliate.get(a.id) ?? {
      conversions: 0,
      activeAnnual: 0,
      annualRevenue: 0,
      annualCommission: 0,
      abandoned: 0,
    },
  }));

  return <AffiliatesPanel affiliates={enriched} />;
}
