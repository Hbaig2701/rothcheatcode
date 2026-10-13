"use client";

import { ChevronDown, HelpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  COMMISSION_HOLD_DAYS,
  MIN_PAYOUT_CENTS,
  PAYOUT_DAY_OF_MONTH,
} from "@/lib/affiliates/constants";

// Refer & Earn FAQ. Every number comes from the same settings the ledger and
// payout run use, so the answers can't drift from what actually happens.

function money(dollars: number): string {
  return `$${Math.round(dollars).toLocaleString("en-US")}`;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

const fmt = (d: Date) =>
  d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

/** Worked example: a payment on Oct 20 → when it clears → when it's paid. */
function timingExample() {
  const paid = new Date(Date.UTC(2026, 9, 20));
  const clears = new Date(paid.getTime() + COMMISSION_HOLD_DAYS * 86_400_000);
  let payout = new Date(
    Date.UTC(
      clears.getUTCFullYear(),
      clears.getUTCMonth(),
      PAYOUT_DAY_OF_MONTH,
    ),
  );
  if (payout < clears) {
    payout = new Date(
      Date.UTC(
        clears.getUTCFullYear(),
        clears.getUTCMonth() + 1,
        PAYOUT_DAY_OF_MONTH,
      ),
    );
  }
  return { paid: fmt(paid), clears: fmt(clears), payout: fmt(payout) };
}

export function ReferFaq({
  discountPct,
  commissionPct,
  perReferralAnnual,
}: {
  discountPct: number;
  commissionPct: number;
  perReferralAnnual: number;
}) {
  const ex = timingExample();
  const payDay = ordinal(PAYOUT_DAY_OF_MONTH);
  const minimum = money(MIN_PAYOUT_CENTS / 100);

  const faqs: Array<{ q: string; a: React.ReactNode }> = [
    {
      q: "How does someone count as my referral?",
      a: (
        <>
          They enter your referral code at checkout when they subscribe. The
          code is how we know they came from you, so if they sign up without it,
          we can&apos;t credit you. Make sure they use it.
        </>
      ),
    },
    {
      q: "What does my referral get?",
      a: (
        <>
          {discountPct}% off the annual plan, for as long as they stay
          subscribed. Codes work for new customers signing up for the annual
          plan.
        </>
      ),
    },
    {
      q: "How much do I earn?",
      a: (
        <>
          {commissionPct}% of what each referral pays, before tax. On the annual
          plan that&apos;s {money(perReferralAnnual)} a year per referral. If a
          referral later switches plans, you still earn {commissionPct}% of what
          they pay.
        </>
      ),
    },
    {
      q: "Is it a one-time bonus or recurring?",
      a: (
        <>
          Recurring. You earn again every time your referral renews, every year,
          for as long as they stay subscribed. If they cancel, commissions stop,
          but you keep what you&apos;ve already earned.
        </>
      ),
    },
    {
      q: "When do I get paid?",
      a: (
        <>
          A commission clears {COMMISSION_HOLD_DAYS} days after your referral
          pays. On the {payDay} of each month, everything that has cleared goes
          to your bank account, as long as you have at least {minimum} cleared.
          Smaller amounts carry over to the next month.
          <br />
          <br />
          For example, if your referral pays on {ex.paid}, the commission clears
          on {ex.clears} and is paid on {ex.payout}. When they renew the next
          year, that commission is paid the same way.
        </>
      ),
    },
    {
      q: `Why the ${COMMISSION_HOLD_DAYS}-day wait?`,
      a: (
        <>
          So that if a new customer asks for a refund soon after signing up, we
          haven&apos;t already paid commission on money we gave back.
        </>
      ),
    },
    {
      q: "How do I get paid?",
      a: (
        <>
          By direct deposit through Stripe, our payments provider. Click{" "}
          <strong className="font-medium text-foreground">
            Set up payouts
          </strong>{" "}
          on this page, choose the country your bank account is in (United
          States or Canada), and add your bank details. It takes about five
          minutes. Commissions are paid in US dollars; if your bank account is
          in Canadian dollars, Stripe converts them when it pays you.
        </>
      ),
    },
    {
      q: "What if my referral gets a refund or disputes a charge?",
      a: (
        <>
          The commission on the refunded or disputed amount is taken back from
          your next payout. If a dispute is decided in our favor, the commission
          is added back.
        </>
      ),
    },
    {
      q: "Can I use my own code?",
      a: (
        <>
          No. Codes only work for new customers, and you can&apos;t earn
          commission on your own subscription.
        </>
      ),
    },
    {
      q: "Where can I see what I've earned?",
      a: (
        <>
          In{" "}
          <strong className="font-medium text-foreground">
            Earnings &amp; payouts
          </strong>{" "}
          on this page. <em>Pending</em> is still in the {COMMISSION_HOLD_DAYS}
          -day wait, <em>Ready to pay</em> goes out on the next {payDay}, and{" "}
          <em>Paid to date</em> is everything you&apos;ve received. For your
          deposits and bank details, click{" "}
          <strong className="font-medium text-foreground">
            Open Stripe dashboard
          </strong>
          .
        </>
      ),
    },
    {
      q: "What about taxes?",
      a: (
        <>
          Stripe collects your tax details when you set up payouts. Commissions
          are income, so report them the way you report your other income.
        </>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HelpCircle className="size-4 text-gold" />
          Frequently asked questions
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border-default border-t border-border-default">
          {faqs.map((f) => (
            <details key={f.q} className="group px-6 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
