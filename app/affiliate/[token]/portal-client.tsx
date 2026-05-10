"use client";

import { useState } from "react";
import { Copy, Check, AlertCircle, ShoppingCart, TrendingUp, Users, Sparkles } from "lucide-react";

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

const fmtUSD = (dollars: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(dollars);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function AffiliatePortalClient({
  affiliate,
  stats,
  annualCommissionPerCustomer,
  annualRecurringCommission,
  discountedAnnualPerCustomer,
}: {
  affiliate: AffiliateView;
  stats: PortalStats;
  annualCommissionPerCustomer: number;
  annualRecurringCommission: number;
  discountedAnnualPerCustomer: number;
}) {
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  function copyToClipboard(text: string, label: string) {
    void navigator.clipboard.writeText(text);
    setCopiedItem(label);
    setTimeout(() => setCopiedItem(null), 1500);
  }

  const sharePitch = `Use code ${affiliate.code} at checkout to save 20% on the annual plan at app.retirementexpert.ai.`;

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
              <p className="text-sm font-semibold text-foreground">Your code is currently paused</p>
              <p className="text-sm text-foreground/75 mt-1">
                New customers can&apos;t redeem <span className="font-mono font-semibold">{affiliate.code}</span> right now.
                Existing subscribers keep their discount and you&apos;ll continue earning on their renewals.
                Reach out if this is unexpected.
              </p>
            </div>
          </div>
        )}

        {/* Headline stats — three tiles, the commission one is the hero */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          <div className="rounded-2xl border border-border-default bg-bg-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Users className="size-4 text-foreground/60" />
              <p className="text-xs uppercase tracking-wider text-foreground/60 font-semibold">
                Active subscribers
              </p>
            </div>
            <p className="text-[52px] font-display font-bold text-foreground leading-none">
              {stats.active_annual}
            </p>
            <p className="text-sm text-foreground/70 mt-3">
              {stats.conversions === 0
                ? "Waiting on your first conversion."
                : `${stats.conversions} total conversion${stats.conversions === 1 ? "" : "s"} ever.`}
            </p>
          </div>

          {/* Commission tile — gold accent, the headline number */}
          <div className="rounded-2xl border border-gold/40 bg-gradient-to-br from-gold/10 to-gold/5 p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 size-24 bg-gold/10 rounded-full blur-2xl -mr-12 -mt-12" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="size-4 text-gold" />
                <p className="text-xs uppercase tracking-wider text-gold font-semibold">
                  Annual recurring commission
                </p>
              </div>
              <p className="text-[52px] font-display font-bold text-gold leading-none">
                {fmtUSD(annualRecurringCommission)}
              </p>
              <p className="text-sm text-foreground/80 mt-3">
                {fmtUSD(annualCommissionPerCustomer)} per active subscriber, every year they stay.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border-default bg-bg-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="size-4 text-foreground/60" />
              <p className="text-xs uppercase tracking-wider text-foreground/60 font-semibold">
                Your terms
              </p>
            </div>
            <p className="text-[52px] font-display font-bold text-foreground leading-none">
              {affiliate.commission_pct}<span className="text-foreground/40">%</span>
            </p>
            <p className="text-sm text-foreground/70 mt-3">
              On {fmtUSD(discountedAnnualPerCustomer)}/yr per customer. Recurring on every renewal.
            </p>
          </div>
        </div>

        {/* Code section */}
        <section className="rounded-2xl border border-border-default bg-bg-card p-8 mb-8">
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="text-lg font-display font-semibold text-foreground">Your code</h2>
            <span className="text-xs text-foreground/60">Click anything to copy</span>
          </div>

          {/* Big code button + explanation */}
          <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 items-center mb-8">
            <button
              type="button"
              onClick={() => copyToClipboard(affiliate.code, "code")}
              className="group flex items-center gap-4 rounded-xl border-2 border-gold-border bg-gradient-to-br from-gold/15 to-accent/40 hover:from-gold/25 hover:to-accent/60 transition-all px-7 py-5 font-mono text-[32px] font-bold text-foreground tracking-wide"
            >
              {affiliate.code}
              {copiedItem === "code" ? (
                <Check className="size-6 text-emerald-400" />
              ) : (
                <Copy className="size-6 text-foreground/50 group-hover:text-foreground/80 transition-colors" />
              )}
            </button>
            <p className="text-base text-foreground/85 leading-relaxed">
              Share this code anywhere your audience trusts you. Customers enter it at checkout for{" "}
              <strong className="text-foreground font-semibold">20% off the annual plan</strong>, forever.
              You earn commission as long as they stay subscribed.
            </p>
          </div>

          {/* Share assets */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-foreground/60 font-semibold mb-2">
                Suggested message
              </p>
              <button
                type="button"
                onClick={() => copyToClipboard(sharePitch, "pitch")}
                className="group w-full text-left rounded-xl border border-border-default bg-bg-base hover:bg-accent/30 transition-colors px-4 py-3.5 text-sm text-foreground flex items-start justify-between gap-3"
              >
                <span className="leading-relaxed">&ldquo;{sharePitch}&rdquo;</span>
                {copiedItem === "pitch" ? (
                  <Check className="size-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <Copy className="size-4 text-foreground/40 group-hover:text-foreground/70 shrink-0 mt-0.5 transition-colors" />
                )}
              </button>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-foreground/60 font-semibold mb-2">
                Direct link
              </p>
              <button
                type="button"
                onClick={() => copyToClipboard("https://app.retirementexpert.ai", "link")}
                className="group w-full text-left rounded-xl border border-border-default bg-bg-base hover:bg-accent/30 transition-colors px-4 py-3.5 text-sm text-foreground flex items-center justify-between gap-3"
              >
                <span className="font-mono">app.retirementexpert.ai</span>
                {copiedItem === "link" ? (
                  <Check className="size-4 text-emerald-400 shrink-0" />
                ) : (
                  <Copy className="size-4 text-foreground/40 group-hover:text-foreground/70 shrink-0 transition-colors" />
                )}
              </button>
              <p className="text-xs text-foreground/60 mt-2 leading-relaxed">
                Customers click → choose Annual → enter <span className="font-mono text-foreground font-semibold">{affiliate.code}</span> at Stripe checkout.
              </p>
            </div>
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
                  {stats.abandoned_count} {stats.abandoned_count === 1 ? "person" : "people"} entered your code but didn&apos;t finish.
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
                Once someone redeems your code at checkout, they&apos;ll show up here.
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
          Numbers reflect attributed customers from your code. Active subscribers and recurring
          commission assume customers stay subscribed at the discounted annual rate.
          Actual payouts reconcile against Stripe invoices.
        </p>
      </div>
    </div>
  );
}
