"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, Crown, Shield, Clock } from "lucide-react";

interface BillingData {
  plan: string;
  isGrandfathered: boolean;
  billingCycle: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  hasStripeSubscription: boolean;
  isTeamMember: boolean;
  usage: {
    scenarioRuns: number;
    pdfExports: number;
    clients: number;
  };
  limits: {
    scenarioRuns: number | null;
    pdfExports: number | null;
    clients: number | null;
    teamMembers: number;
  };
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min((value / max) * 100, 100);
  const isNearLimit = pct >= 80;
  return (
    <div className="h-2 w-full rounded-full bg-secondary">
      <div
        className={`h-full rounded-full transition-all ${
          isNearLimit ? "bg-[#f59e0b]" : "bg-gold"
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function BillingTab() {
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    fetch("/api/billing/usage")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const isTrial = data.subscriptionStatus === "trialing";
  const trialDaysLeft = data.trialEnd
    ? Math.max(0, Math.ceil((new Date(data.trialEnd).getTime() - Date.now()) / 86400000))
    : null;
  const planLabel =
    data.plan === "standard"
      ? isTrial
        ? "Subscription Trial"
        : "Active Subscription"
      : data.plan === "pro"
        ? isTrial
          ? "Premium Trial"
          : "Premium"
        : data.plan === "starter"
          ? "Starter"
          : "None";

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.open(data.url, "_blank");
        setPortalLoading(false);
      } else {
        alert(data.error || "Failed to open billing portal");
        setPortalLoading(false);
      }
    } catch {
      alert("Failed to open billing portal");
      setPortalLoading(false);
    }
  };


  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {data.plan === "standard" || data.plan === "pro" ? (
              <Crown className="size-5 text-gold" />
            ) : (
              <CreditCard className="size-5" />
            )}
            Current Plan
          </CardTitle>
          <CardDescription>
            Manage your subscription and billing
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-semibold text-foreground">{planLabel}</p>
              {data.isGrandfathered && (
                <span className="mt-1 inline-block rounded-full bg-[rgba(212,175,55,0.15)] px-2.5 py-0.5 text-xs font-medium text-gold">
                  Grandfathered
                </span>
              )}
              {data.isTeamMember && (
                <p className="mt-1 text-sm text-muted-foreground">
                  <Shield className="mr-1 inline size-3.5" />
                  Managed by team owner
                </p>
              )}
              {isTrial && trialDaysLeft !== null && (
                <div className="mt-1.5 flex items-center gap-1.5 text-sm text-[#60a5fa]">
                  <Clock className="size-3.5" />
                  <span>
                    {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} remaining
                  </span>
                </div>
              )}
              {data.billingCycle && !data.isGrandfathered && !isTrial && (
                <p className="text-sm text-muted-foreground">
                  {data.billingCycle === "annual" ? "Annual" : "Monthly"} billing
                </p>
              )}
              {data.currentPeriodEnd && !data.isGrandfathered && !isTrial && (
                <p className="text-xs text-muted-foreground mt-1">
                  Renews{" "}
                  {new Date(data.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}
            </div>

            {data.subscriptionStatus && !data.isGrandfathered && (
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  data.subscriptionStatus === "active"
                    ? "bg-[rgba(74,222,128,0.15)] text-green"
                    : data.subscriptionStatus === "trialing"
                      ? "bg-[rgba(96,165,250,0.15)] text-[#60a5fa]"
                      : data.subscriptionStatus === "past_due"
                        ? "bg-[rgba(245,158,11,0.15)] text-[#f59e0b]"
                        : "bg-[rgba(239,68,68,0.15)] text-[#ef4444]"
                }`}
              >
                {data.subscriptionStatus === "trialing" ? "trial" : data.subscriptionStatus}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Usage — Starter only */}
      {data.plan === "starter" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usage This Period</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {data.limits.clients !== null && (
              <div>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="text-muted-foreground">Active Clients</span>
                  <span className="font-mono text-foreground">
                    {data.usage.clients}/{data.limits.clients}
                  </span>
                </div>
                <ProgressBar
                  value={data.usage.clients}
                  max={data.limits.clients}
                />
              </div>
            )}
            {data.limits.scenarioRuns !== null && (
              <div>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="text-muted-foreground">Scenario Runs</span>
                  <span className="font-mono text-foreground">
                    {data.usage.scenarioRuns}/{data.limits.scenarioRuns}
                  </span>
                </div>
                <ProgressBar
                  value={data.usage.scenarioRuns}
                  max={data.limits.scenarioRuns}
                />
              </div>
            )}
            {data.limits.pdfExports !== null && (
              <div>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="text-muted-foreground">PDF Exports</span>
                  <span className="font-mono text-foreground">
                    {data.usage.pdfExports}/{data.limits.pdfExports}
                  </span>
                </div>
                <ProgressBar
                  value={data.usage.pdfExports}
                  max={data.limits.pdfExports}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          {/* Manage subscription — only for paying users */}
          {data.hasStripeSubscription && !data.isTeamMember && (
            <>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleManageSubscription}
                disabled={portalLoading}
              >
                {portalLoading && (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                )}
                Manage Subscription
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Update payment method, change plan, view invoices, or cancel
              </p>
            </>
          )}

          {/* Grandfathered users */}
          {data.isGrandfathered && (
            <p className="text-center text-sm text-muted-foreground">
              You have complimentary Pro access. No billing actions needed.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
