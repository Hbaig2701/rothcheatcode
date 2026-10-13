import Link from "next/link";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { MIN_PAYOUT_CENTS } from "@/lib/affiliates/commissions";

// Admin view of the affiliate commission ledger: what each affiliate is owed,
// whether they can be paid, and every commission / reversal / payout.
export const dynamic = "force-dynamic";

interface AffiliateRow {
  id: string;
  name: string;
  email: string;
  code: string;
  stripe_account_id: string | null;
  payouts_enabled: boolean | null;
}

interface CommissionRow {
  id: string;
  affiliate_id: string;
  kind: "commission" | "refund" | "dispute" | "dispute_won";
  stripe_invoice_id: string;
  stripe_customer_id: string | null;
  amount_cents: number;
  paid_amount_cents: number;
  available_at: string;
  payout_id: string | null;
  created_at: string;
}

interface PayoutRow {
  id: string;
  affiliate_id: string;
  amount_cents: number;
  status: "processing" | "paid" | "failed";
  stripe_transfer_id: string | null;
  error: string | null;
  created_at: string;
  paid_at: string | null;
}

const fmtUSD = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

const KIND_LABEL: Record<CommissionRow["kind"], string> = {
  commission: "Commission",
  refund: "Refund reversal",
  dispute: "Chargeback reversal",
  dispute_won: "Chargeback won",
};

/** The 1st of next month, 15:00 UTC — when the payout cron runs. */
function nextPayoutRun(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 15));
}

type Bal = { pending: number; owed: number; paid: number; lastPaid: string | null };

// Loads and rolls up the ledger. Kept outside the component so reading the
// clock doesn't happen during render.
async function loadPayoutsData() {
  const admin = createAdminClient();

  const [{ data: affRaw }, { data: commRaw }, { data: payRaw }] = await Promise.all([
    admin.from("affiliates").select("id, name, email, code, stripe_account_id, payouts_enabled"),
    admin
      .from("affiliate_commissions")
      .select("id, affiliate_id, kind, stripe_invoice_id, stripe_customer_id, amount_cents, paid_amount_cents, available_at, payout_id, created_at")
      .order("created_at", { ascending: false }),
    admin
      .from("affiliate_payouts")
      .select("id, affiliate_id, amount_cents, status, stripe_transfer_id, error, created_at, paid_at")
      .order("created_at", { ascending: false }),
  ]);

  const affiliates = (affRaw ?? []) as AffiliateRow[];
  const commissions = (commRaw ?? []) as CommissionRow[];
  const payouts = (payRaw ?? []) as PayoutRow[];
  const paidPayoutIds = new Set(payouts.filter((p) => p.status === "paid").map((p) => p.id));

  const now = Date.now();
  const bal = new Map<string, Bal>(affiliates.map((a) => [a.id, { pending: 0, owed: 0, paid: 0, lastPaid: null }]));
  for (const c of commissions) {
    const b = bal.get(c.affiliate_id);
    if (!b) continue;
    const amt = Number(c.amount_cents);
    if (c.payout_id && paidPayoutIds.has(c.payout_id)) b.paid += amt;
    else if (c.payout_id || new Date(c.available_at).getTime() <= now) b.owed += amt;
    else b.pending += amt;
  }
  for (const p of payouts) {
    const b = bal.get(p.affiliate_id);
    if (b && p.status === "paid" && p.paid_at && (!b.lastPaid || p.paid_at > b.lastPaid)) b.lastPaid = p.paid_at;
  }

  const rows = affiliates
    .map((a) => ({ a, b: bal.get(a.id)! }))
    .filter(({ a, b }) => a.stripe_account_id || b.pending || b.owed || b.paid)
    .sort((x, y) => y.b.owed + y.b.pending - (x.b.owed + x.b.pending));

  const totals = rows.reduce(
    (t, { b }) => ({ pending: t.pending + b.pending, owed: t.owed + b.owed, paid: t.paid + b.paid }),
    { pending: 0, owed: 0, paid: 0 }
  );

  return {
    rows,
    totals,
    commissions,
    payouts,
    paidPayoutIds,
    byId: new Map(affiliates.map((a) => [a.id, a])),
    nextRun: nextPayoutRun(new Date(now)),
  };
}

export default async function AffiliatePayoutsPage() {
  const { rows, totals, commissions, payouts, paidPayoutIds, byId, nextRun } = await loadPayoutsData();

  function nextStatus(a: AffiliateRow, b: Bal): { text: string; tone: string } {
    if (!a.stripe_account_id) return { text: "Hasn't set up payouts", tone: "text-amber-400" };
    if (!a.payouts_enabled) return { text: "Payout setup unfinished", tone: "text-amber-400" };
    if (b.owed >= MIN_PAYOUT_CENTS) return { text: `Pays ${fmtDate(nextRun.toISOString())}`, tone: "text-green" };
    if (b.owed + b.pending > 0) return { text: `Under ${fmtUSD(MIN_PAYOUT_CENTS)} — carries over`, tone: "text-text-dim" };
    return { text: "Ready, nothing owed", tone: "text-text-dim" };
  }

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
        <h1 className="text-[28px] font-display font-bold text-foreground leading-tight">Affiliate Payouts</h1>
        <p className="text-sm text-text-dim mt-1 max-w-2xl">
          Commissions clear 30 days after the referral pays, then go out automatically on the 1st of
          each month (next run {fmtDate(nextRun.toISOString())}) to anyone with payouts set up and at
          least {fmtUSD(MIN_PAYOUT_CENTS)} cleared.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Tile label="Owed now (cleared)" value={fmtUSD(totals.owed)} />
        <Tile label="Pending (in 30-day hold)" value={fmtUSD(totals.pending)} />
        <Tile label="Paid out all-time" value={fmtUSD(totals.paid)} />
      </div>

      <Section title="By affiliate">
        {rows.length === 0 ? (
          <Empty>No commissions yet and nobody has set up payouts.</Empty>
        ) : (
          <table className="w-full text-sm">
            <Head cols={["Affiliate", "Owed now", "Pending", "Paid to date", "Last paid", "Next payout"]} />
            <tbody>
              {rows.map(({ a, b }) => {
                const s = nextStatus(a, b);
                return (
                  <tr key={a.id} className="border-b border-border-default last:border-b-0">
                    <td className="px-4 py-3">
                      <p className="text-foreground">{a.name}</p>
                      <p className="text-xs text-text-dim">
                        <span className="font-mono">{a.code}</span> · {a.email}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-mono text-foreground">{fmtUSD(b.owed)}</td>
                    <td className="px-4 py-3 font-mono text-text-dim">{fmtUSD(b.pending)}</td>
                    <td className="px-4 py-3 font-mono text-text-dim">{fmtUSD(b.paid)}</td>
                    <td className="px-4 py-3 text-text-dim">{b.lastPaid ? fmtDate(b.lastPaid) : "—"}</td>
                    <td className={`px-4 py-3 ${s.tone}`}>{s.text}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Payouts">
        {payouts.length === 0 ? (
          <Empty>No payouts yet.</Empty>
        ) : (
          <table className="w-full text-sm">
            <Head cols={["Date", "Affiliate", "Amount", "Status", "Stripe"]} />
            <tbody>
              {payouts.slice(0, 100).map((p) => (
                <tr key={p.id} className="border-b border-border-default last:border-b-0">
                  <td className="px-4 py-3 text-text-dim">{fmtDate(p.paid_at ?? p.created_at)}</td>
                  <td className="px-4 py-3 text-foreground">{byId.get(p.affiliate_id)?.name ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-foreground">{fmtUSD(Number(p.amount_cents))}</td>
                  <td className="px-4 py-3">
                    <span className={p.status === "paid" ? "text-green" : p.status === "failed" ? "text-[#ef4444]" : "text-amber-400"}>
                      {p.status}
                    </span>
                    {p.error && <p className="text-xs text-text-dim max-w-xs truncate" title={p.error}>{p.error}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {p.stripe_transfer_id ? (
                      <StripeLink href={`https://dashboard.stripe.com/connect/transfers/${p.stripe_transfer_id}`} />
                    ) : (
                      <span className="text-text-dimmer">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Ledger (latest 200)">
        {commissions.length === 0 ? (
          <Empty>No commissions recorded yet. One appears here the moment a referred customer pays.</Empty>
        ) : (
          <table className="w-full text-sm">
            <Head cols={["Recorded", "Affiliate", "Type", "Customer paid", "Commission", "Clears", "Invoice"]} />
            <tbody>
              {commissions.slice(0, 200).map((c) => (
                <tr key={c.id} className="border-b border-border-default last:border-b-0">
                  <td className="px-4 py-3 text-text-dim">{fmtDate(c.created_at)}</td>
                  <td className="px-4 py-3 text-foreground">{byId.get(c.affiliate_id)?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-text-dim">{KIND_LABEL[c.kind]}</td>
                  <td className="px-4 py-3 font-mono text-text-dim">{fmtUSD(Number(c.paid_amount_cents))}</td>
                  <td className={`px-4 py-3 font-mono ${Number(c.amount_cents) < 0 ? "text-[#ef4444]" : "text-foreground"}`}>
                    {fmtUSD(Number(c.amount_cents))}
                  </td>
                  <td className="px-4 py-3 text-text-dim">
                    {c.payout_id && paidPayoutIds.has(c.payout_id) ? "Paid" : fmtDate(c.available_at)}
                  </td>
                  <td className="px-4 py-3">
                    <StripeLink href={`https://dashboard.stripe.com/invoices/${c.stripe_invoice_id}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-border-default bg-bg-card p-5">
      <p className="text-xs uppercase tracking-wider text-text-dimmer mb-1">{label}</p>
      <p className="text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xs uppercase tracking-wider text-text-dimmer font-semibold mb-3">{title}</h2>
      <div className="rounded-[14px] border border-border-default bg-bg-card overflow-x-auto">{children}</div>
    </section>
  );
}

function Head({ cols }: { cols: string[] }) {
  return (
    <thead className="bg-[rgba(255,255,255,0.02)] border-b border-border-default">
      <tr className="text-left text-xs uppercase tracking-wider text-text-dimmer">
        {cols.map((c) => (
          <th key={c} className="px-4 py-2.5 font-semibold whitespace-nowrap">{c}</th>
        ))}
      </tr>
    </thead>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-6 py-10 text-center text-sm text-text-dim">{children}</p>;
}

function StripeLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-text-dim hover:text-foreground transition-colors"
    >
      View
      <ExternalLink className="size-3" />
    </a>
  );
}
