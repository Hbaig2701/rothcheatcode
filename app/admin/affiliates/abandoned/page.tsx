import Link from "next/link";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";

interface AbandonedRow {
  id: string;
  affiliate_id: string;
  stripe_session_id: string;
  customer_email: string | null;
  customer_name: string | null;
  amount_cents: number | null;
  plan: string | null;
  cycle: string | null;
  expired_at: string;
  affiliate: { name: string; code: string } | null;
}

const fmtUSD = (cents: number | null) =>
  cents == null
    ? "—"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export default async function AbandonedCartsPage() {
  const admin = createAdminClient();

  const { data } = await admin
    .from("affiliate_abandoned_checkouts")
    .select("*, affiliate:affiliates(name, code)")
    .order("expired_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as AbandonedRow[];

  return (
    <div>
      <Link
        href="/admin/affiliates"
        className="inline-flex items-center gap-1 text-sm text-text-dim hover:text-foreground mb-6 transition-colors"
      >
        <ChevronLeft className="size-4" />
        Back to Affiliates
      </Link>

      <div className="mb-8">
        <h1 className="text-[28px] font-display font-bold text-foreground leading-tight">Abandoned Checkouts</h1>
        <p className="text-sm text-text-dim mt-1">
          Stripe sessions where someone entered an affiliate code but didn&apos;t finish paying.
          Use the customer email to follow up directly. Showing the most recent {rows.length}.
        </p>
      </div>

      <div className="rounded-[14px] border border-border-default bg-bg-card overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-text-dim">
            No abandoned carts yet. They&apos;ll show up here when a Stripe checkout session expires
            (default ~24 hours after start).
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[rgba(255,255,255,0.02)] border-b border-border-default">
              <tr className="text-left text-xs uppercase tracking-wider text-text-dimmer">
                <th className="px-4 py-2.5 font-semibold">Expired</th>
                <th className="px-4 py-2.5 font-semibold">Customer</th>
                <th className="px-4 py-2.5 font-semibold">Affiliate</th>
                <th className="px-4 py-2.5 font-semibold">Cart</th>
                <th className="px-4 py-2.5 font-semibold text-right">Amount</th>
                <th className="px-4 py-2.5 font-semibold text-right">Stripe</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border-default last:border-b-0 hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                  <td className="px-4 py-3 text-text-dim">{fmtDate(r.expired_at)}</td>
                  <td className="px-4 py-3">
                    {r.customer_email ? (
                      <div>
                        <a
                          href={`mailto:${r.customer_email}?subject=Following up on Retirement Expert`}
                          className="text-foreground hover:text-gold transition-colors"
                        >
                          {r.customer_email}
                        </a>
                        {r.customer_name && (
                          <p className="text-xs text-text-dim">{r.customer_name}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-text-dimmer italic">No email captured</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.affiliate ? (
                      <div>
                        <p className="text-foreground">{r.affiliate.name}</p>
                        <p className="text-xs font-mono text-text-dim">{r.affiliate.code}</p>
                      </div>
                    ) : (
                      <span className="text-text-dimmer">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-dim text-xs">
                    {r.plan && r.cycle ? `${r.plan} · ${r.cycle}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-foreground font-mono">{fmtUSD(r.amount_cents)}</td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`https://dashboard.stripe.com/checkout/sessions/${r.stripe_session_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-text-dim hover:text-foreground transition-colors"
                    >
                      View
                      <ExternalLink className="size-3" />
                    </a>
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
