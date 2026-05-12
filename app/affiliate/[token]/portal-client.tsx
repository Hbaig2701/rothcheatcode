"use client";

import { useState } from "react";
import { Copy, Check, AlertCircle, ShoppingCart, TrendingUp, Users, Sparkles, Info } from "lucide-react";

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

interface CodeWithEconomics {
  id: string;
  code: string;
  discount_pct: number;
  commission_pct: number;
  is_active: boolean;
  active_subscribers: number;
  discounted_annual: number;
  annual_commission_per_customer: number;
  annual_recurring_commission: number;
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
  codes: Array<{ id: string; code: string; discount_pct: number; commission_pct: number; is_active: boolean; active_subscribers: number }>;
}

const fmtUSD = (dollars: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(dollars);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function AffiliatePortalClient({
  affiliate,
  stats,
  codes,
  totalActiveSubscribers,
  totalRecurringCommission,
}: {
  affiliate: AffiliateView;
  stats: PortalStats;
  codes: CodeWithEconomics[];
  totalActiveSubscribers: number;
  totalRecurringCommission: number;
}) {
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  function copyToClipboard(text: string, label: string) {
    void navigator.clipboard.writeText(text);
    setCopiedItem(label);
    setTimeout(() => setCopiedItem(null), 1500);
  }

  // Sort codes so the highest-commission tier (lowest discount) appears
  // first. That's the one we want to subtly promote in the layout — it
  // pays the affiliate more and protects the customer's margin.
  const sortedCodes = [...codes].sort((a, b) => b.commission_pct - a.commission_pct);
  const bestCommission = sortedCodes[0];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="mb-12">
          <p className="text-xs uppercase tracking-[2.5px] text-gold font-semibold mb-3">
            Affiliate Portal
          </p>
          <h1 className="text-[40px] md:text-[44px] font-display font-bold leading-[1.1] text-foreground">
            Welcome back, {affiliate.name.split(" ")[0]}
          </h1>
          <p className="text-base text-foreground/70 mt-3 max-w-2xl">
            Here&apos;s how your referrals are doing. Bookmark this page — the URL is your private dashboard.
          </p>
        </header>

        {/* Paused warning */}
        {!affiliate.is_active && (
          <div className="mb-8 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-5">
            <AlertCircle className="size-5 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">Your account is currently paused</p>
              <p className="text-sm text-foreground/75 mt-1">
                New customers can&apos;t redeem your codes right now.
                Existing subscribers keep their discount and you&apos;ll continue earning on their renewals.
                Reach out if this is unexpected.
              </p>
            </div>
          </div>
        )}

        {/* Headline stats — two big tiles, totals across all codes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
          <div className="rounded-2xl border border-border-default bg-bg-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Users className="size-4 text-foreground/60" />
              <p className="text-xs uppercase tracking-wider text-foreground/60 font-semibold">
                Active subscribers
              </p>
            </div>
            <p className="text-[52px] font-mono font-semibold text-foreground leading-none tabular-nums tracking-tight">
              {totalActiveSubscribers}
            </p>
            <p className="text-sm text-foreground/70 mt-3">
              {stats.conversions === 0
                ? "Waiting on your first conversion."
                : `${stats.conversions} total conversion${stats.conversions === 1 ? "" : "s"} ever, across all your codes.`}
            </p>
          </div>

          <div className="rounded-2xl border border-gold/40 bg-gradient-to-br from-gold/10 to-gold/5 p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 size-24 bg-gold/10 rounded-full blur-2xl -mr-12 -mt-12" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="size-4 text-gold" />
                <p className="text-xs uppercase tracking-wider text-gold font-semibold">
                  Annual recurring commission
                </p>
              </div>
              <p className="text-[52px] font-mono font-semibold text-gold leading-none tabular-nums tracking-tight">
                {fmtUSD(totalRecurringCommission)}
              </p>
              <p className="text-sm text-foreground/80 mt-3">
                Across all active subscribers, every year they stay.
              </p>
            </div>
          </div>
        </div>

        {/* Your codes section */}
        <section className="rounded-2xl border border-border-default bg-bg-card p-8 mb-8">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-lg font-display font-semibold text-foreground">Your codes</h2>
            <span className="text-xs text-foreground/60">Click any code to copy</span>
          </div>

          {/* Tradeoff explainer */}
          <div className="flex items-start gap-2.5 rounded-lg border border-foreground/10 bg-foreground/[0.03] p-4 mb-6">
            <Info className="size-4 text-foreground/70 mt-0.5 shrink-0" />
            <p className="text-sm text-foreground/85 leading-relaxed">
              You have <strong className="text-foreground">{sortedCodes.length} code{sortedCodes.length === 1 ? "" : "s"}</strong>{" "}
              you can share. <strong className="text-foreground">The smaller the discount you give, the bigger your commission.</strong>{" "}
              Pick the code that fits your audience — they all give the customer 20%, 10%, or 5% off the annual plan, forever,
              and you earn your share for as long as they stay subscribed.
            </p>
          </div>

          <div className="space-y-3">
            {sortedCodes.map((c) => {
              const isBest = c.id === bestCommission?.id;
              return (
                <div
                  key={c.id}
                  className={`relative rounded-xl border p-5 transition-colors ${
                    isBest
                      ? "border-gold/50 bg-gradient-to-br from-gold/10 to-transparent"
                      : "border-border-default bg-bg-base"
                  } ${!c.is_active ? "opacity-50" : ""}`}
                >
                  {isBest && c.is_active && (
                    <span className="absolute -top-2.5 left-5 inline-flex items-center gap-1 rounded-full bg-gold px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-bg-base">
                      <Sparkles className="size-3" />
                      Highest commission
                    </span>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-5 items-center">
                    {/* The code itself */}
                    <button
                      type="button"
                      onClick={() => c.is_active && copyToClipboard(c.code, `code-${c.id}`)}
                      disabled={!c.is_active}
                      className={`group flex items-center gap-3 rounded-lg border-2 px-5 py-3.5 font-mono text-2xl font-bold tracking-wide transition-all ${
                        isBest
                          ? "border-gold/60 bg-gold/15 hover:bg-gold/25 text-foreground"
                          : "border-border-default bg-bg-card hover:bg-accent/30 text-foreground"
                      } ${!c.is_active ? "cursor-not-allowed" : ""}`}
                    >
                      {c.code}
                      {copiedItem === `code-${c.id}` ? (
                        <Check className="size-5 text-emerald-400" />
                      ) : c.is_active ? (
                        <Copy className="size-5 text-foreground/50 group-hover:text-foreground/80 transition-colors" />
                      ) : null}
                    </button>

                    {/* Tier description */}
                    <div>
                      <p className="text-sm text-foreground/85 leading-relaxed">
                        Customer saves <strong className="text-foreground">{c.discount_pct}%</strong>
                        {" "}({fmtUSD(c.discounted_annual)}/year).
                        You earn{" "}
                        <strong className={isBest ? "text-gold" : "text-foreground"}>
                          {c.commission_pct}%
                        </strong>{" "}
                        = <strong className={isBest ? "text-gold" : "text-foreground"}>
                          {fmtUSD(c.annual_commission_per_customer)}/customer/year
                        </strong>.
                      </p>
                      {!c.is_active && (
                        <p className="text-xs text-amber-400 mt-1.5">Code paused — not redeemable by new customers</p>
                      )}
                    </div>

                    {/* Per-code subscriber stat */}
                    <div className="text-right md:min-w-[120px]">
                      <p className="text-2xl font-mono font-semibold text-foreground tabular-nums leading-none">
                        {c.active_subscribers}
                      </p>
                      <p className="text-xs text-foreground/60 mt-1">
                        active sub{c.active_subscribers === 1 ? "" : "s"}
                      </p>
                      {c.active_subscribers > 0 && (
                        <p className={`text-xs font-mono mt-0.5 ${isBest ? "text-gold" : "text-foreground/70"}`}>
                          {fmtUSD(c.annual_recurring_commission)}/yr
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Direct link */}
          <div className="mt-6 pt-6 border-t border-border-default">
            <p className="text-xs uppercase tracking-wider text-foreground/60 font-semibold mb-2">
              Where to send your audience
            </p>
            <button
              type="button"
              onClick={() => copyToClipboard("https://www.retirementexpert.ai", "link")}
              className="group w-full text-left rounded-xl border border-border-default bg-bg-base hover:bg-accent/30 transition-colors px-4 py-3.5 text-sm text-foreground flex items-center justify-between gap-3"
            >
              <span className="font-mono">www.retirementexpert.ai</span>
              {copiedItem === "link" ? (
                <Check className="size-4 text-emerald-400 shrink-0" />
              ) : (
                <Copy className="size-4 text-foreground/40 group-hover:text-foreground/70 shrink-0 transition-colors" />
              )}
            </button>
            <p className="text-xs text-foreground/60 mt-2 leading-relaxed">
              Customers visit the site → choose the annual plan → enter your code at Stripe checkout.
              Any of your active codes work.
            </p>
          </div>
        </section>

        {/* Almost-buyers (abandoned checkouts) */}
        {stats.abandoned_count > 0 && (
          <section className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-7 mb-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center justify-center size-9 rounded-lg bg-amber-500/20">
                <ShoppingCart className="size-4 text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-display font-semibold text-foreground">
                  Almost-buyers
                </h2>
                <p className="text-sm text-foreground/70">
                  {stats.abandoned_count} {stats.abandoned_count === 1 ? "person" : "people"} entered one of your codes but didn&apos;t finish.
                </p>
              </div>
            </div>
            <p className="text-sm text-foreground/70 mb-4 leading-relaxed">
              We follow up with these prospects on our side, but if you have a relationship,
              a personal nudge often closes the deal. Showing the last {stats.recent_abandons.length}.
            </p>
            <ul className="space-y-2">
              {stats.recent_abandons.map((a, idx) => (
                <li
                  key={idx}
                  className="flex items-center justify-between rounded-lg border border-border-default bg-bg-base px-4 py-3 text-sm"
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-foreground font-medium">{fmtDate(a.expired_at)}</span>
                    {a.amount_cents != null && (
                      <>
                        <span className="text-foreground/30">·</span>
                        <span className="text-foreground/80 font-mono">{fmtUSD(a.amount_cents / 100)}</span>
                      </>
                    )}
                    {a.cycle && (
                      <span className="text-xs rounded-full bg-foreground/10 px-2.5 py-0.5 text-foreground/70 capitalize font-medium">
                        {a.cycle}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-foreground/55">
                    {a.has_email ? "Email captured" : "No email"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Recent conversions */}
        <section className="rounded-2xl border border-border-default bg-bg-card p-7 mb-8">
          <h2 className="text-lg font-display font-semibold text-foreground mb-5">
            Recent conversions
          </h2>
          {stats.recent_conversions.length === 0 ? (
            <div className="text-center py-10 px-4">
              <div className="mx-auto mb-4 size-14 rounded-full bg-foreground/5 flex items-center justify-center">
                <Sparkles className="size-6 text-foreground/40" />
              </div>
              <p className="text-base text-foreground/85 font-medium mb-1">No conversions yet</p>
              <p className="text-sm text-foreground/60">
                Once someone redeems one of your codes at checkout, they&apos;ll show up here.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {stats.recent_conversions.map((c, idx) => {
                const isActive = c.status === "active" || c.status === "trialing";
                return (
                  <li
                    key={idx}
                    className="flex items-center justify-between rounded-lg border border-border-default bg-bg-base px-4 py-3 text-sm"
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-foreground/65">
                        Customer #{stats.recent_conversions.length - idx}
                      </span>
                      <span className="text-foreground/30">·</span>
                      <span className="text-foreground font-medium">{fmtDate(c.created_at)}</span>
                      {c.code && (
                        <span className="text-xs rounded-full bg-foreground/10 px-2.5 py-0.5 text-foreground/80 font-mono font-medium">
                          {c.code}
                        </span>
                      )}
                      {c.cycle && (
                        <span className="text-xs rounded-full bg-foreground/10 px-2.5 py-0.5 text-foreground/70 capitalize font-medium">
                          {c.cycle}
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-xs rounded-full px-2.5 py-1 font-semibold ${
                        isActive
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-foreground/10 text-foreground/65"
                      }`}
                    >
                      {c.status ?? "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Account + payout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
          <section className="rounded-2xl border border-border-default bg-bg-card p-6">
            <h3 className="text-xs uppercase tracking-wider text-foreground/60 font-semibold mb-4">
              Account
            </h3>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between items-baseline">
                <dt className="text-foreground/65">Name</dt>
                <dd className="text-foreground font-medium">{affiliate.name}</dd>
              </div>
              <div className="flex justify-between items-baseline gap-3">
                <dt className="text-foreground/65 shrink-0">Email</dt>
                <dd className="text-foreground font-medium truncate">{affiliate.email}</dd>
              </div>
              <div className="flex justify-between items-baseline">
                <dt className="text-foreground/65">Joined</dt>
                <dd className="text-foreground font-medium">{fmtDate(affiliate.created_at)}</dd>
              </div>
            </dl>
          </section>
          <section className="rounded-2xl border border-border-default bg-bg-card p-6">
            <h3 className="text-xs uppercase tracking-wider text-foreground/60 font-semibold mb-4">
              Payouts
            </h3>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between items-baseline gap-3">
                <dt className="text-foreground/65 shrink-0">PayPal</dt>
                <dd className="font-medium truncate">
                  {affiliate.paypal_email ? (
                    <span className="text-foreground">{affiliate.paypal_email}</span>
                  ) : (
                    <span className="text-amber-400">Not set — email us to add it</span>
                  )}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-foreground/65 mt-4 leading-relaxed">
              Commissions are paid monthly via PayPal once your accrued total exceeds $50.
              If anything looks off, just reply to your welcome email.
            </p>
          </section>
        </div>

        <p className="text-xs text-foreground/55 text-center leading-relaxed">
          Numbers reflect attributed customers from your codes. Each code&apos;s commission is calculated
          against the discounted annual price. Actual payouts reconcile against Stripe invoices.
        </p>
      </div>
    </div>
  );
}
