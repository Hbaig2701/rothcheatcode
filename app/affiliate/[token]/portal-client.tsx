"use client";

import { useState } from "react";
import { Copy, Check, ExternalLink, AlertCircle } from "lucide-react";

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
  recent_conversions: Array<{ created_at: string; status: string | null; cycle: string | null }>;
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
        <header className="mb-10">
          <p className="text-xs uppercase tracking-[2px] text-text-dimmer mb-2">Affiliate Portal</p>
          <h1 className="text-[32px] font-display font-bold leading-tight">
            Welcome back, {affiliate.name.split(" ")[0]}
          </h1>
          <p className="text-sm text-text-dim mt-2">
            Here&apos;s how your referrals are doing. Bookmark this page — the URL is your private dashboard.
          </p>
        </header>

        {!affiliate.is_active && (
          <div className="mb-6 flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-4">
            <AlertCircle className="size-5 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Your code is currently paused</p>
              <p className="text-xs text-text-dim mt-0.5">
                New customers can&apos;t redeem {affiliate.code} right now. Existing subscribers keep their
                discount and you&apos;ll continue earning on their renewals. Reach out if this is unexpected.
              </p>
            </div>
          </div>
        )}

        {/* Headline numbers */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          <div className="rounded-[14px] border border-gold-border bg-accent/30 p-5">
            <p className="text-xs uppercase tracking-wider text-text-muted mb-2">Active subscribers</p>
            <p className="text-[36px] font-display font-bold text-foreground leading-none">
              {stats.active_annual}
            </p>
            <p className="text-xs text-text-dim mt-1.5">
              {stats.conversions} total conversions ever
            </p>
          </div>
          <div className="rounded-[14px] border border-gold-border bg-accent/30 p-5">
            <p className="text-xs uppercase tracking-wider text-text-muted mb-2">Annual recurring commission</p>
            <p className="text-[36px] font-display font-bold text-gold leading-none">
              {fmtUSD(annualRecurringCommission)}
            </p>
            <p className="text-xs text-text-dim mt-1.5">
              {fmtUSD(annualCommissionPerCustomer)} per active subscriber/year
            </p>
          </div>
          <div className="rounded-[14px] border border-border-default bg-bg-card p-5">
            <p className="text-xs uppercase tracking-wider text-text-muted mb-2">Your terms</p>
            <p className="text-sm text-foreground">
              <span className="font-mono font-bold text-foreground">{affiliate.commission_pct}%</span> commission
            </p>
            <p className="text-xs text-text-dim mt-1">
              On {fmtUSD(discountedAnnualPerCustomer)}/yr per customer
            </p>
            <p className="text-xs text-text-dim mt-1">
              Recurring on every renewal
            </p>
          </div>
        </div>

        {/* Share section */}
        <div className="rounded-[14px] border border-border-default bg-bg-card p-6 mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dimmer mb-4">Your code</h2>
          <div className="flex items-center gap-3 mb-5">
            <button
              type="button"
              onClick={() => copyToClipboard(affiliate.code, "code")}
              className="inline-flex items-center gap-3 rounded-md border border-gold-border bg-accent/40 hover:bg-accent transition-colors px-4 py-3 font-mono text-2xl font-bold text-foreground"
            >
              {affiliate.code}
              {copiedItem === "code" ? (
                <Check className="size-5 text-emerald-400" />
              ) : (
                <Copy className="size-5 text-text-dim" />
              )}
            </button>
            <p className="text-sm text-text-dim">
              Share this code. Customers enter it at checkout for{" "}
              <strong className="text-foreground">20% off the annual plan</strong>, forever.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-text-dimmer mb-1.5">Suggested message</p>
              <button
                type="button"
                onClick={() => copyToClipboard(sharePitch, "pitch")}
                className="w-full text-left rounded-md border border-border-default bg-bg-base hover:bg-accent/20 transition-colors px-4 py-3 text-sm text-foreground flex items-start justify-between gap-3"
              >
                <span>&ldquo;{sharePitch}&rdquo;</span>
                {copiedItem === "pitch" ? (
                  <Check className="size-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <Copy className="size-4 text-text-dim shrink-0 mt-0.5" />
                )}
              </button>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-text-dimmer mb-1.5">Direct link to checkout</p>
              <button
                type="button"
                onClick={() => copyToClipboard("https://app.retirementexpert.ai", "link")}
                className="w-full text-left rounded-md border border-border-default bg-bg-base hover:bg-accent/20 transition-colors px-4 py-3 text-sm text-foreground flex items-center justify-between gap-3"
              >
                <span className="font-mono">https://app.retirementexpert.ai</span>
                {copiedItem === "link" ? (
                  <Check className="size-4 text-emerald-400 shrink-0" />
                ) : (
                  <Copy className="size-4 text-text-dim shrink-0" />
                )}
              </button>
              <p className="text-xs text-text-dimmer mt-1.5">
                Customers click → choose Annual → enter <span className="font-mono text-foreground">{affiliate.code}</span> at the Stripe checkout step.
              </p>
            </div>
          </div>
        </div>

        {/* Recent conversions */}
        <div className="rounded-[14px] border border-border-default bg-bg-card p-6 mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dimmer mb-4">
            Recent conversions
          </h2>
          {stats.recent_conversions.length === 0 ? (
            <p className="text-sm text-text-dim italic">
              No conversions yet. Once someone redeems your code at checkout, they&apos;ll show up here.
            </p>
          ) : (
            <ul className="space-y-2">
              {stats.recent_conversions.map((c, idx) => {
                const isActive = c.status === "active" || c.status === "trialing";
                return (
                  <li
                    key={idx}
                    className="flex items-center justify-between rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-text-dim">Customer #{stats.recent_conversions.length - idx}</span>
                      <span className="text-text-dimmer">·</span>
                      <span className="text-foreground">{fmtDate(c.created_at)}</span>
                      {c.cycle && (
                        <span className="text-xs rounded-full bg-muted px-2 py-0.5 text-text-dim capitalize">
                          {c.cycle}
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                        isActive
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-muted text-text-dim"
                      }`}
                    >
                      {c.status ?? "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Account info + payout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="rounded-[14px] border border-border-default bg-bg-card p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-text-dimmer mb-3">Account</h3>
            <div className="space-y-1.5 text-sm">
              <p>
                <span className="text-text-dim">Name:</span>{" "}
                <span className="text-foreground">{affiliate.name}</span>
              </p>
              <p>
                <span className="text-text-dim">Email:</span>{" "}
                <span className="text-foreground">{affiliate.email}</span>
              </p>
              <p>
                <span className="text-text-dim">Joined:</span>{" "}
                <span className="text-foreground">{fmtDate(affiliate.created_at)}</span>
              </p>
            </div>
          </div>
          <div className="rounded-[14px] border border-border-default bg-bg-card p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-text-dimmer mb-3">Payouts</h3>
            <div className="space-y-1.5 text-sm">
              <p>
                <span className="text-text-dim">PayPal:</span>{" "}
                <span className="text-foreground">{affiliate.paypal_email ?? <em className="text-text-dimmer">not set — email us to add it</em>}</span>
              </p>
              <p className="text-xs text-text-dim mt-2">
                Commissions are paid out monthly via PayPal once your accrued total exceeds $50.
                If anything looks off, just reply to your invitation email.
              </p>
            </div>
          </div>
        </div>

        <p className="text-xs text-text-dimmer text-center">
          Numbers reflect attributed customers from your code. Active subscribers and recurring
          commission assume customers stay subscribed at the discounted annual rate. Actual payouts
          reconcile against Stripe invoices.
        </p>
      </div>
    </div>
  );
}
