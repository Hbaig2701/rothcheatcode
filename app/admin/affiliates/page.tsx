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

interface AffiliateCodeRow {
  id: string;
  affiliate_id: string;
  code: string;
  discount_pct: string | number;
  commission_pct: string | number;
  stripe_promotion_code_id: string;
  is_active: boolean;
}

interface ProfileRow {
  affiliate_id: string;
  affiliate_code_id: string | null;
  subscription_status: string | null;
  billing_cycle: string | null;
}

export default async function AffiliatesPage() {
  const admin = createAdminClient();

  const [
    { data: affiliatesRaw },
    { data: codesRaw },
    { data: attributedProfiles },
    { data: abandonedRows },
  ] = await Promise.all([
    admin.from("affiliates").select("*").order("created_at", { ascending: false }),
    admin.from("affiliate_codes").select("*").order("discount_pct", { ascending: true }),
    admin
      .from("profiles")
      .select("affiliate_id, affiliate_code_id, subscription_status, billing_cycle")
      .not("affiliate_id", "is", null),
    admin.from("affiliate_abandoned_checkouts").select("affiliate_id"),
  ]);

  const affiliates = (affiliatesRaw ?? []) as AffiliateRow[];
  const codes = (codesRaw ?? []) as AffiliateCodeRow[];
  const profiles = (attributedProfiles ?? []) as ProfileRow[];

  const annualListPrice = PLAN_PRICES.standard.annual.amount;

  type CodeStats = { active_subscribers: number; annual_revenue: number; annual_commission: number };
  const codeStats = new Map<string, CodeStats>();
  for (const c of codes) {
    codeStats.set(c.id, { active_subscribers: 0, annual_revenue: 0, annual_commission: 0 });
  }

  for (const p of profiles) {
    if (!p.affiliate_code_id) continue;
    const code = codes.find((c) => c.id === p.affiliate_code_id);
    if (!code) continue;
    if (
      (p.subscription_status === "active" || p.subscription_status === "trialing") &&
      p.billing_cycle === "annual"
    ) {
      const s = codeStats.get(code.id);
      if (s) {
        const discounted = annualListPrice * (1 - Number(code.discount_pct) / 100);
        s.active_subscribers += 1;
        s.annual_revenue += discounted;
        s.annual_commission += discounted * (Number(code.commission_pct) / 100);
      }
    }
  }

  // Per-affiliate rollups: aggregate across all of their codes.
  type AffStats = {
    conversions: number;
    activeAnnual: number;
    annualRevenue: number;
    annualCommission: number;
    abandoned: number;
  };
  const affStats = new Map<string, AffStats>();
  for (const a of affiliates) {
    affStats.set(a.id, {
      conversions: 0,
      activeAnnual: 0,
      annualRevenue: 0,
      annualCommission: 0,
      abandoned: 0,
    });
  }
  for (const p of profiles) {
    const s = affStats.get(p.affiliate_id);
    if (!s) continue;
    s.conversions += 1;
    if (p.affiliate_code_id) {
      const code = codes.find((c) => c.id === p.affiliate_code_id);
      if (
        code &&
        (p.subscription_status === "active" || p.subscription_status === "trialing") &&
        p.billing_cycle === "annual"
      ) {
        const discounted = annualListPrice * (1 - Number(code.discount_pct) / 100);
        s.activeAnnual += 1;
        s.annualRevenue += discounted;
        s.annualCommission += discounted * (Number(code.commission_pct) / 100);
      }
    }
  }
  for (const r of ((abandonedRows ?? []) as Array<{ affiliate_id: string }>)) {
    const s = affStats.get(r.affiliate_id);
    if (s) s.abandoned += 1;
  }

  const enriched = affiliates.map((a) => {
    const affCodes = codes
      .filter((c) => c.affiliate_id === a.id)
      .map((c) => ({
        ...c,
        discount_pct: Number(c.discount_pct),
        commission_pct: Number(c.commission_pct),
        stats: codeStats.get(c.id) ?? { active_subscribers: 0, annual_revenue: 0, annual_commission: 0 },
      }));
    return {
      ...a,
      codes: affCodes,
      stats: affStats.get(a.id) ?? {
        conversions: 0,
        activeAnnual: 0,
        annualRevenue: 0,
        annualCommission: 0,
        abandoned: 0,
      },
    };
  });

  return <AffiliatesPanel affiliates={enriched} />;
}
