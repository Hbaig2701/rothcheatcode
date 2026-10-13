"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Gift,
  Copy,
  Check,
  Users,
  TrendingUp,
  BadgeDollarSign,
  Clock,
  Landmark,
  ExternalLink,
} from "lucide-react";

interface CodeEconomics {
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

interface EnrolledPayload {
  enrolled: true;
  per_referral_annual: number;
  affiliate: {
    id: string;
    name: string;
    email: string;
    is_active: boolean;
    created_at: string;
  };
  referral_code: string;
  signup_url: string;
  stats: {
    conversions: number;
    active_annual: number;
    abandoned_count: number;
  };
  codes: CodeEconomics[];
  totals: {
    active_subscribers: number;
    annual_recurring_commission: number;
  };
  payouts: Payouts;
}

interface Payouts {
  status: "not_started" | "incomplete" | "active";
  pending_cents: number;
  available_cents: number;
  paid_cents: number;
  min_payout_cents: number;
  payouts: Array<{
    id: string;
    amount_cents: number;
    status: "processing" | "paid";
    date: string;
  }>;
}

type MeResponse =
  | { enrolled: false; per_referral_annual: number }
  | EnrolledPayload;

function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

export function ReferTab() {
  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/affiliate/me");
      const json = (await res.json()) as MeResponse;
      setData(json);
    } catch {
      setError("Couldn't load your referral program. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const enroll = async () => {
    setEnrolling(true);
    setError(null);
    try {
      const res = await fetch("/api/affiliate/me", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Couldn't enroll you. Please try again.");
      } else {
        setData(json as MeResponse);
      }
    } catch {
      setError("Couldn't enroll you. Please try again.");
    } finally {
      setEnrolling(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.enrolled) {
    return (
      <JoinCard
        perReferralAnnual={data?.per_referral_annual ?? 594}
        onEnroll={enroll}
        enrolling={enrolling}
        error={error}
      />
    );
  }

  return <Dashboard data={data} error={error} />;
}

// ── Not enrolled: the pitch + one-click join ─────────────────────────────
function JoinCard({
  perReferralAnnual,
  onEnroll,
  enrolling,
  error,
}: {
  perReferralAnnual: number;
  onEnroll: () => void;
  enrolling: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-6">
      {/* Headline hero — the money number leads */}
      <Card className="overflow-hidden border-gold-border bg-[rgba(212,175,55,0.06)]">
        <CardContent className="py-9 text-center">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[rgba(212,175,55,0.15)] px-3 py-1 text-xs font-medium text-gold">
            <Gift className="size-3.5" />
            Refer &amp; Earn
          </div>
          <p className="font-display text-[44px] leading-none font-semibold text-foreground">
            {money(perReferralAnnual)}
            <span className="text-2xl font-normal text-muted-foreground">
              {" "}
              / referral
            </span>
          </p>
          <p className="mt-3 text-lg font-medium text-gold">
            every year — for as long as they stay
          </p>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
            Refer another advisor to Retirement Expert. They get 20% off, you
            earn {money(perReferralAnnual)}/year in commission — recurring for
            life, not a one-time bounty.
          </p>
          <div className="mt-6 flex flex-col items-center gap-2">
            <Button onClick={onEnroll} disabled={enrolling} size="lg">
              {enrolling && <Loader2 className="mr-2 size-4 animate-spin" />}
              Join the referral program
            </Button>
            <p className="text-xs text-muted-foreground">
              Your personal code is generated instantly.
            </p>
          </div>
          {error && <p className="mt-3 text-sm text-[#ef4444]">{error}</p>}
        </CardContent>
      </Card>

      {/* How it works */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Perk
          icon={<Gift className="size-4 text-gold" />}
          title="20% off for them"
          body="Your referral gets 20% off the annual plan — for as long as they stay subscribed."
        />
        <Perk
          icon={<BadgeDollarSign className="size-4 text-gold" />}
          title={`${money(perReferralAnnual)} to you`}
          body="You earn 25% commission on what each referral pays, every single year they renew."
        />
        <Perk
          icon={<TrendingUp className="size-4 text-gold" />}
          title="Recurring for life"
          body="Two referrals is over $1,000/year. Ten is nearly $6,000/year — as long as they stay."
        />
      </div>
    </div>
  );
}

function Perk({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[12px] border border-border-default bg-secondary/40 p-4">
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <span className="text-sm font-medium text-foreground">{title}</span>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

// ── Enrolled: code + stats + payouts ─────────────────────────────────────
function Dashboard({
  data,
  error,
}: {
  data: EnrolledPayload;
  error: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const primary =
    data.codes.find((c) => c.code === data.referral_code) ?? data.codes[0] ?? null;

  const shareMessage = `Sign up for Retirement Expert at ${data.signup_url} and use code ${data.referral_code} for 20% off the annual plan.`;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — no-op */
    }
  };

  return (
    <div className="space-y-6">
      {/* Referral code */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="size-5 text-gold" />
            Your referral code
          </CardTitle>
          <CardDescription>
            Share this code. Your referral enters it at checkout for 20% off the
            annual plan, and you earn {primary ? primary.commission_pct : 25}%
            commission on it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 rounded-[10px] border border-gold-border bg-[rgba(212,175,55,0.08)] px-4 py-3 font-mono text-lg font-semibold tracking-wide text-foreground">
              {data.referral_code}
            </div>
            <Button
              variant="outline"
              onClick={() => copy(data.referral_code)}
              className="shrink-0"
            >
              {copied ? (
                <Check className="mr-2 size-4 text-green" />
              ) : (
                <Copy className="mr-2 size-4" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>

          <div className="rounded-[10px] border border-border-default bg-secondary/40 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Ready-to-send message
            </p>
            <p className="text-sm text-foreground">{shareMessage}</p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 h-8 px-2 text-xs"
              onClick={() => copy(shareMessage)}
            >
              <Copy className="mr-1.5 size-3.5" />
              Copy message
            </Button>
          </div>

          {primary && (
            <p className="text-xs text-muted-foreground">
              Each referral pays {money(primary.discounted_annual)}/yr after their
              discount — you earn{" "}
              <span className="font-medium text-foreground">
                {money(primary.annual_commission_per_customer)}/yr
              </span>{" "}
              for every year they stay subscribed.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<Users className="size-4 text-gold" />}
          label="Total sign-ups"
          value={data.stats.conversions.toLocaleString()}
        />
        <Stat
          icon={<BadgeDollarSign className="size-4 text-gold" />}
          label="Active subscribers"
          value={data.totals.active_subscribers.toLocaleString()}
        />
        <Stat
          icon={<TrendingUp className="size-4 text-gold" />}
          label="Annual commission"
          value={money(data.totals.annual_recurring_commission)}
          sub="recurring, at current subscribers"
        />
        <Stat
          icon={<Clock className="size-4 text-gold" />}
          label="Almost sign-ups"
          value={data.stats.abandoned_count.toLocaleString()}
          sub="entered your code, didn't finish"
        />
      </div>

      {/* Earnings + payout account */}
      <PayoutsCard payouts={data.payouts} />

      {error && <p className="text-sm text-[#ef4444]">{error}</p>}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-1.5 flex items-center gap-2">
          {icon}
          <span className="text-xs font-medium text-muted-foreground">
            {label}
          </span>
        </div>
        <p className="text-2xl font-semibold text-foreground">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function cents(n: number): string {
  return `$${(n / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function PayoutsCard({ payouts }: { payouts: Payouts }) {
  const [opening, setOpening] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const open = async (action: "onboard" | "dashboard") => {
    setOpening(true);
    setMsg(null);
    try {
      const res = await fetch("/api/affiliate/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        setMsg(json.error ?? "Couldn't open Stripe. Please try again.");
        setOpening(false);
        return;
      }
      window.location.href = json.url as string;
    } catch {
      setMsg("Couldn't open Stripe. Please try again.");
      setOpening(false);
    }
  };

  const { status } = payouts;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Landmark className="size-4 text-gold" />
          Earnings &amp; payouts
        </CardTitle>
        <CardDescription>
          Commissions clear 30 days after your referral pays, then go straight
          to your bank on the 1st of each month once you have at least{" "}
          {cents(payouts.min_payout_cents)} cleared.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Balance
            label="Pending"
            value={cents(payouts.pending_cents)}
            sub="in the 30-day hold"
          />
          <Balance
            label="Ready to pay"
            value={cents(payouts.available_cents)}
            sub="goes out on the 1st"
          />
          <Balance
            label="Paid to date"
            value={cents(payouts.paid_cents)}
          />
        </div>

        <div className="flex flex-col gap-3 rounded-[10px] border border-border-default bg-secondary/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            {status === "active" && (
              <p className="text-foreground">
                <Check className="mr-1.5 inline size-4 text-green" />
                Payouts are set up. Manage your bank and tax forms in Stripe.
              </p>
            )}
            {status === "incomplete" && (
              <p className="text-foreground">
                Your payout setup isn&apos;t finished — complete it so we can
                pay you.
              </p>
            )}
            {status === "not_started" && (
              <p className="text-foreground">
                Connect a bank account through Stripe to get paid. Takes about
                five minutes; Stripe also collects your W-9.
              </p>
            )}
          </div>
          <Button
            onClick={() => open(status === "active" ? "dashboard" : "onboard")}
            disabled={opening}
            variant={status === "active" ? "outline" : "default"}
            className="shrink-0"
          >
            {opening ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              status === "active" && <ExternalLink className="mr-2 size-4" />
            )}
            {status === "active"
              ? "Open Stripe dashboard"
              : status === "incomplete"
                ? "Finish payout setup"
                : "Set up payouts"}
          </Button>
        </div>
        {msg && <p className="text-sm text-[#ef4444]">{msg}</p>}

        {payouts.payouts.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Payout history
            </p>
            <ul className="divide-y divide-border-default rounded-[10px] border border-border-default text-sm">
              {payouts.payouts.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-muted-foreground">
                    {new Date(p.date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  <span className="font-medium text-foreground">
                    {cents(p.amount_cents)}
                    {p.status === "processing" && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        processing
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Balance({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-[10px] border border-border-default p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
