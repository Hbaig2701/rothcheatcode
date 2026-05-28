"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Copy, Check, ExternalLink, ShoppingCart, Sparkles } from "lucide-react";

interface CodeRow {
  id: string;
  code: string;
  discount_pct: number;
  commission_pct: number;
  is_active: boolean;
  stats: { active_subscribers: number; annual_revenue: number; annual_commission: number };
}

interface AffiliateWithStats {
  id: string;
  name: string;
  email: string;
  paypal_email: string | null;
  code: string;
  commission_pct: number;
  portal_token: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  codes: CodeRow[];
  stats: {
    conversions: number;
    activeAnnual: number;
    annualRevenue: number;
    annualCommission: number;
    abandoned: number;
  };
}

const fmtUSD = (dollars: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(dollars);

// Default commission rate for each discount tier — lower discount, higher
// commission. Admin can override per code via the form.
const DEFAULT_COMMISSION: Record<number, number> = {
  20: 25,
  10: 30,
  5: 35,
};

const TIERS = [20, 10, 5] as const;
type Tier = (typeof TIERS)[number];

export function AffiliatesPanel({ affiliates }: { affiliates: AffiliateWithStats[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [paypal, setPaypal] = useState("");
  const [baseCode, setBaseCode] = useState("");
  // Per-tier opt-in + commission %
  const [tierEnabled, setTierEnabled] = useState<Record<Tier, boolean>>({ 20: true, 10: true, 5: true });
  const [tierCommission, setTierCommission] = useState<Record<Tier, number>>({ ...DEFAULT_COMMISSION } as Record<Tier, number>);

  function suggestBase(n: string) {
    return n.trim().split(/\s+/)[0]?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? "";
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const tiers = TIERS.filter((t) => tierEnabled[t]).map((t) => ({
      discount_pct: t,
      commission_pct: tierCommission[t],
    }));
    if (tiers.length === 0) {
      setError("Pick at least one discount tier.");
      return;
    }

    setCreating(true);
    const res = await fetch("/api/admin/affiliates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim(),
        paypal_email: paypal.trim() || null,
        base_code: baseCode.trim() || suggestBase(name),
        tiers,
      }),
    });
    setCreating(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      // The API returns Zod field-level details for validation failures.
      // Surface them so the user can see WHICH field tripped instead of a
      // bare "Validation failed".
      const fieldErrs = j?.details?.fieldErrors as Record<string, string[]> | undefined;
      if (fieldErrs) {
        const messages = Object.entries(fieldErrs)
          .map(([field, errs]) => `${field}: ${(errs ?? []).join(", ")}`)
          .filter((m) => m.includes(":"));
        if (messages.length > 0) {
          setError(`${j.error}: ${messages.join(" · ")}`);
          return;
        }
      }
      setError(j.error ?? "Failed to create affiliate");
      return;
    }
    setName("");
    setEmail("");
    setPaypal("");
    setBaseCode("");
    setTierEnabled({ 20: true, 10: true, 5: true });
    setTierCommission({ ...DEFAULT_COMMISSION } as Record<Tier, number>);
    setShowForm(false);
    router.refresh();
  }

  async function toggleAffiliateActive(id: string, current: boolean) {
    await fetch(`/api/admin/affiliates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !current }),
    });
    router.refresh();
  }

  function copy(text: string, label: string) {
    void navigator.clipboard.writeText(text);
    setCopiedItem(label);
    setTimeout(() => setCopiedItem(null), 1500);
  }

  // Roll-ups across all affiliates
  const totals = affiliates.reduce(
    (acc, a) => {
      acc.conversions += a.stats.conversions;
      acc.activeAnnual += a.stats.activeAnnual;
      acc.annualRevenue += a.stats.annualRevenue;
      acc.annualCommission += a.stats.annualCommission;
      acc.abandoned += a.stats.abandoned;
      return acc;
    },
    { conversions: 0, activeAnnual: 0, annualRevenue: 0, annualCommission: 0, abandoned: 0 }
  );

  // Live preview of customer-facing codes from the base
  const previewBase = baseCode.trim() || suggestBase(name);

  return (
    <div>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-[28px] font-display font-bold text-foreground leading-tight">Affiliates</h1>
          <p className="text-sm text-text-dim mt-1 max-w-2xl">
            Each affiliate gets up to three Stripe codes — 20%, 10%, and 5% off the annual plan.
            The smaller the discount they share, the higher their commission cut.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/affiliates/abandoned"
            className="inline-flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-400 hover:bg-amber-500/20 transition-colors"
          >
            <ShoppingCart className="size-4" />
            Abandoned ({totals.abandoned})
          </Link>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 rounded-md bg-gold px-4 py-2 text-sm font-medium text-bg-base hover:bg-gold/90 transition-colors"
          >
            <Plus className="size-4" />
            Add Affiliate
          </button>
        </div>
      </div>

      {/* Roll-up tiles */}
      <div className="grid grid-cols-5 gap-3 mb-8">
        <div className="rounded-[10px] border border-border-default bg-bg-card px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-text-dimmer mb-1">Total affiliates</p>
          <p className="text-xl font-semibold text-foreground">{affiliates.length}</p>
        </div>
        <div className="rounded-[10px] border border-border-default bg-bg-card px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-text-dimmer mb-1">Active annual subs</p>
          <p className="text-xl font-semibold text-foreground">{totals.activeAnnual}</p>
        </div>
        <div className="rounded-[10px] border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-text-dimmer mb-1">Abandoned carts</p>
          <p className="text-xl font-semibold text-amber-400">{totals.abandoned}</p>
        </div>
        <div className="rounded-[10px] border border-border-default bg-bg-card px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-text-dimmer mb-1">Attributed annual revenue</p>
          <p className="text-xl font-semibold text-foreground">{fmtUSD(totals.annualRevenue)}</p>
        </div>
        <div className="rounded-[10px] border border-border-default bg-bg-card px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-text-dimmer mb-1">Annual commission owed</p>
          <p className="text-xl font-semibold text-foreground">{fmtUSD(totals.annualCommission)}</p>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-[14px] border border-border-default bg-bg-card p-6 mb-8 space-y-5"
        >
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="text-text-dim mb-1 block">Affiliate name</span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => { if (!baseCode) setBaseCode(suggestBase(name)); }}
                className="w-full rounded-md border border-border bg-input/30 px-3 py-2 text-sm"
                placeholder="Jane Smith"
              />
            </label>
            <label className="block text-sm">
              <span className="text-text-dim mb-1 block">Contact email</span>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-border bg-input/30 px-3 py-2 text-sm"
                placeholder="jane@example.com"
              />
            </label>
            <label className="block text-sm">
              <span className="text-text-dim mb-1 block">PayPal email (for payouts)</span>
              <input
                type="email"
                value={paypal}
                onChange={(e) => setPaypal(e.target.value)}
                className="w-full rounded-md border border-border bg-input/30 px-3 py-2 text-sm"
                placeholder="jane@paypal.com"
              />
            </label>
            <label className="block text-sm">
              <span className="text-text-dim mb-1 block">
                Code base <span className="text-text-dimmer">(uppercased automatically)</span>
              </span>
              <input
                required
                value={baseCode}
                onChange={(e) => setBaseCode(e.target.value.toUpperCase())}
                className="w-full rounded-md border border-border bg-input/30 px-3 py-2 text-sm font-mono"
                placeholder="JANE"
              />
              {previewBase && (
                <p className="text-xs text-text-dimmer mt-1.5">
                  Codes will be:{" "}
                  {TIERS.filter((t) => tierEnabled[t]).map((t) => `${previewBase}${t}`).join(", ") || "(pick a tier)"}
                </p>
              )}
            </label>
          </div>

          <div>
            <p className="text-sm text-text-dim mb-3">Discount tiers</p>
            <div className="space-y-2">
              {TIERS.map((t) => (
                <label
                  key={t}
                  className={`flex items-center gap-4 rounded-md border px-4 py-3 text-sm cursor-pointer transition-colors ${
                    tierEnabled[t] ? "border-gold/40 bg-gold/5" : "border-border-default bg-bg-base hover:bg-accent/20"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={tierEnabled[t]}
                    onChange={(e) => setTierEnabled({ ...tierEnabled, [t]: e.target.checked })}
                    className="size-4 rounded border-border shrink-0"
                  />
                  <span className="text-foreground font-mono w-12">{t}%</span>
                  <span className="text-text-dim flex-1">
                    Customer saves {t}% on the annual plan
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-dim">Commission</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={tierCommission[t]}
                      onChange={(e) => setTierCommission({ ...tierCommission, [t]: Number(e.target.value) })}
                      disabled={!tierEnabled[t]}
                      className="w-20 rounded-md border border-border bg-input/30 px-2 py-1 text-sm font-mono text-right disabled:opacity-50"
                    />
                    <span className="text-text-dim text-xs">%</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => { setShowForm(false); setError(null); }}
              className="px-3 py-2 text-sm text-text-dim hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-md bg-gold px-4 py-2 text-sm font-medium text-bg-base hover:bg-gold/90 disabled:opacity-60 transition-colors"
            >
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Create affiliate + Stripe codes
            </button>
          </div>
        </form>
      )}

      {/* Affiliate cards */}
      {affiliates.length === 0 ? (
        <div className="rounded-[14px] border border-border-default bg-bg-card px-6 py-12 text-center text-sm text-text-dim">
          No affiliates yet. Add one to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {affiliates.map((a) => {
            const isOpen = expandedId === a.id;
            return (
              <div
                key={a.id}
                className="rounded-[14px] border border-border-default bg-bg-card overflow-hidden"
              >
                {/* Header row */}
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 items-center px-5 py-4">
                  <div>
                    <p className="text-foreground font-medium">{a.name}</p>
                    <p className="text-xs text-text-dim">{a.email}</p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="text-text-dim">{a.stats.activeAnnual} active</p>
                    <p className="text-text-dimmer">{a.stats.conversions} total</p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="text-foreground font-mono font-medium">{fmtUSD(a.stats.annualCommission)}/yr</p>
                    <p className="text-text-dimmer">commission</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const url = `${typeof window !== "undefined" ? window.location.origin : ""}/affiliate/${a.portal_token}`;
                      copy(url, `portal-${a.id}`);
                    }}
                    className="inline-flex items-center gap-1 text-xs text-text-dim hover:text-foreground transition-colors px-2 py-1"
                    title="Copy portal URL"
                  >
                    {copiedItem === `portal-${a.id}` ? (
                      <Check className="size-3 text-emerald-400" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                    Portal
                  </button>
                  <a
                    href={`/affiliate/${a.portal_token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text-dim hover:text-foreground transition-colors p-1"
                    title="Preview portal"
                  >
                    <ExternalLink className="size-3" />
                  </a>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isOpen ? null : a.id)}
                    className="text-xs text-text-dim hover:text-foreground transition-colors px-3 py-1"
                  >
                    {isOpen ? "Hide codes" : `${a.codes.length} code${a.codes.length === 1 ? "" : "s"}`}
                  </button>
                </div>

                {/* Expanded code rows */}
                {isOpen && (
                  <div className="border-t border-border-default px-5 py-4 bg-[rgba(255,255,255,0.015)]">
                    {a.codes.length === 0 ? (
                      <p className="text-xs text-text-dim italic">No codes configured yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {[...a.codes]
                          .sort((x, y) => x.discount_pct - y.discount_pct)
                          .map((c) => (
                            <div
                              key={c.id}
                              className="grid grid-cols-[auto_auto_1fr_auto_auto_auto] gap-3 items-center text-sm py-1.5"
                            >
                              <button
                                type="button"
                                onClick={() => copy(c.code, `code-${c.id}`)}
                                className="inline-flex items-center gap-1.5 rounded-md border border-border-default bg-bg-base hover:bg-accent/40 transition-colors px-2.5 py-1 font-mono text-xs"
                              >
                                {c.code}
                                {copiedItem === `code-${c.id}` ? (
                                  <Check className="size-3 text-emerald-400" />
                                ) : (
                                  <Copy className="size-3 text-text-dim" />
                                )}
                              </button>
                              <span className="text-xs text-foreground font-mono w-12">{c.discount_pct}% off</span>
                              <span className="text-xs text-text-dim">
                                Commission <span className="text-foreground font-mono">{c.commission_pct}%</span>
                              </span>
                              <span className="text-xs text-text-dim text-right w-20">
                                {c.stats.active_subscribers} active
                              </span>
                              <span className="text-xs text-foreground font-mono text-right w-24">
                                {fmtUSD(c.stats.annual_commission)}/yr
                              </span>
                              <span
                                className={`text-[10px] rounded-full px-2 py-0.5 font-semibold ${
                                  c.is_active
                                    ? "bg-emerald-500/15 text-emerald-400"
                                    : "bg-muted text-text-dim"
                                }`}
                              >
                                {c.is_active ? "Active" : "Paused"}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}
                    <div className="mt-3 pt-3 border-t border-border-default flex items-center justify-between">
                      <p className="text-xs text-text-dimmer">
                        {a.paypal_email
                          ? `PayPal: ${a.paypal_email}`
                          : "No PayPal set"}
                      </p>
                      <button
                        type="button"
                        onClick={() => toggleAffiliateActive(a.id, a.is_active)}
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                          a.is_active
                            ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                            : "bg-muted text-text-dim hover:bg-muted/70"
                        }`}
                      >
                        {a.is_active ? "Affiliate active" : "Affiliate disabled"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Hidden — referenced to avoid TS unused-import warnings on Sparkles. */}
      <Sparkles className="hidden" />
    </div>
  );
}
