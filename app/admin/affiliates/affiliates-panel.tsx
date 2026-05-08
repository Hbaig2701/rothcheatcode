"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Copy, Check } from "lucide-react";

interface AffiliateWithStats {
  id: string;
  name: string;
  email: string;
  paypal_email: string | null;
  code: string;
  commission_pct: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  stats: {
    conversions: number;
    activeAnnual: number;
    annualRevenue: number;
    annualCommission: number;
  };
}

const fmtUSD = (dollars: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(dollars);

export function AffiliatesPanel({ affiliates }: { affiliates: AffiliateWithStats[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [paypal, setPaypal] = useState("");
  const [code, setCode] = useState("");
  const [commission, setCommission] = useState(25);

  // Suggest a code based on the name (first name + 20)
  function suggestCode(n: string) {
    const first = n.trim().split(/\s+/)[0]?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? "";
    return first ? `${first}20` : "";
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    const res = await fetch("/api/admin/affiliates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim(),
        paypal_email: paypal.trim() || null,
        code: code.trim() || suggestCode(name),
        commission_pct: commission,
      }),
    });
    setCreating(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Failed to create affiliate");
      return;
    }
    setName("");
    setEmail("");
    setPaypal("");
    setCode("");
    setCommission(25);
    setShowForm(false);
    router.refresh();
  }

  async function toggleActive(id: string, current: boolean) {
    await fetch(`/api/admin/affiliates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !current }),
    });
    router.refresh();
  }

  function copyCode(c: string) {
    void navigator.clipboard.writeText(c);
    setCopiedCode(c);
    setTimeout(() => setCopiedCode(null), 1500);
  }

  // Roll-ups
  const totals = affiliates.reduce(
    (acc, a) => {
      acc.conversions += a.stats.conversions;
      acc.activeAnnual += a.stats.activeAnnual;
      acc.annualRevenue += a.stats.annualRevenue;
      acc.annualCommission += a.stats.annualCommission;
      return acc;
    },
    { conversions: 0, activeAnnual: 0, annualRevenue: 0, annualCommission: 0 }
  );

  return (
    <div>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-[28px] font-display font-bold text-foreground leading-tight">Affiliates</h1>
          <p className="text-sm text-text-dim mt-1">
            Each affiliate gets a unique Stripe promo code. Customers who redeem it at checkout
            get <strong className="text-foreground">20% off the annual plan, forever</strong>. Commissions accrue on every renewal.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-md bg-gold px-4 py-2 text-sm font-medium text-bg-base hover:bg-gold/90 transition-colors"
        >
          <Plus className="size-4" />
          Add Affiliate
        </button>
      </div>

      {/* Roll-up tiles */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        <div className="rounded-[10px] border border-border-default bg-bg-card px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-text-dimmer mb-1">Total affiliates</p>
          <p className="text-xl font-semibold text-foreground">{affiliates.length}</p>
        </div>
        <div className="rounded-[10px] border border-border-default bg-bg-card px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-text-dimmer mb-1">Active annual subs</p>
          <p className="text-xl font-semibold text-foreground">{totals.activeAnnual}</p>
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
          className="rounded-[14px] border border-border-default bg-bg-card p-6 mb-8 space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="text-text-dim mb-1 block">Affiliate name</span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => { if (!code) setCode(suggestCode(name)); }}
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
                Coupon code <span className="text-text-dimmer">(uppercase, 3–30 chars)</span>
              </span>
              <input
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="w-full rounded-md border border-border bg-input/30 px-3 py-2 text-sm font-mono"
                placeholder="JANE20"
              />
            </label>
            <label className="block text-sm">
              <span className="text-text-dim mb-1 block">Commission % of net annual price</span>
              <input
                required
                type="number"
                min={0}
                max={100}
                step={1}
                value={commission}
                onChange={(e) => setCommission(Number(e.target.value))}
                className="w-full rounded-md border border-border bg-input/30 px-3 py-2 text-sm"
              />
            </label>
            <div className="text-xs text-text-dimmer self-end pb-2">
              On a $2,376 net annual sub at {commission}%, the affiliate earns{" "}
              <strong className="text-foreground">{fmtUSD((2376 * commission) / 100)}/year</strong> for as long as the customer stays.
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
              Create affiliate + Stripe code
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="rounded-[14px] border border-border-default bg-bg-card overflow-hidden">
        {affiliates.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-text-dim">No affiliates yet. Add one to get started.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[rgba(255,255,255,0.02)] border-b border-border-default">
              <tr className="text-left text-xs uppercase tracking-wider text-text-dimmer">
                <th className="px-4 py-2.5 font-semibold">Name</th>
                <th className="px-4 py-2.5 font-semibold">Code</th>
                <th className="px-4 py-2.5 font-semibold">Commission</th>
                <th className="px-4 py-2.5 font-semibold text-right">Conversions</th>
                <th className="px-4 py-2.5 font-semibold text-right">Active annual</th>
                <th className="px-4 py-2.5 font-semibold text-right">Annual revenue</th>
                <th className="px-4 py-2.5 font-semibold text-right">Commission/yr</th>
                <th className="px-4 py-2.5 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {affiliates.map((a) => (
                <tr key={a.id} className="border-b border-border-default last:border-b-0 hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-foreground font-medium">{a.name}</p>
                    <p className="text-xs text-text-dim">{a.email}</p>
                    {a.paypal_email && <p className="text-xs text-text-dimmer">PayPal: {a.paypal_email}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => copyCode(a.code)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border-default bg-bg-base hover:bg-accent/40 transition-colors px-2 py-1 font-mono text-xs"
                    >
                      {a.code}
                      {copiedCode === a.code ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3 text-text-dim" />}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-text-dim">{a.commission_pct}%</td>
                  <td className="px-4 py-3 text-right text-text-dim font-mono">{a.stats.conversions}</td>
                  <td className="px-4 py-3 text-right text-text-dim font-mono">{a.stats.activeAnnual}</td>
                  <td className="px-4 py-3 text-right text-foreground font-mono">{fmtUSD(a.stats.annualRevenue)}</td>
                  <td className="px-4 py-3 text-right text-foreground font-mono font-medium">{fmtUSD(a.stats.annualCommission)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => toggleActive(a.id, a.is_active)}
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                        a.is_active
                          ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                          : "bg-muted text-text-dim hover:bg-muted/70"
                      }`}
                    >
                      {a.is_active ? "Active" : "Disabled"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
